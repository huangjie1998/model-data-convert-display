from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Set, Tuple


Affine2D = Tuple[float, float, float, float, float, float]


@dataclass
class BlockExpansionContext:
    block_entities: Dict[str, List[Dict[str, object]]]
    block_origin_by_name: Dict[str, Dict[str, float]]
    layer_styles: Dict[str, Dict[str, object]]
    entities_by_space: Dict[str, List[Dict[str, object]]]
    block_refs_by_space: Dict[str, List[Dict[str, object]]]
    warnings: List[str]
    unresolved_insert_names: Set[str]
    cyclic_insert_names: Set[str]
    capped_spaces: Set[str]
    max_entities_per_space: int
    max_expand_depth: int
    resolve_effective_style: Callable[..., Dict[str, object]]
    insert_transform_from_entity: Callable[[Dict[str, object]], Affine2D]
    transform_entity: Callable[[Dict[str, object], Affine2D], Optional[Dict[str, object]]]
    compose_affine: Callable[[Affine2D, Affine2D], Affine2D]
    apply_affine: Callable[[Affine2D, Dict[str, float]], Dict[str, float]]
    affine_scales: Callable[[Affine2D], Tuple[float, float]]
    apply_bbox_affine: Callable[[Affine2D, object], Optional[Dict[str, Dict[str, float]]]]
    block_ref_id_from_instance_path: Callable[[Tuple[str, ...]], Optional[str]]


def make_block_name_lookup(block_entities: Dict[str, List[Dict[str, object]]]) -> Dict[str, str]:
    return {str(name).casefold(): name for name in block_entities.keys()}


def resolve_block_table_name(
    raw_name: object,
    block_entities: Dict[str, List[Dict[str, object]]],
    block_name_lookup: Dict[str, str],
) -> Optional[str]:
    name = str(raw_name or "").strip()
    if not name:
        return None
    if name in block_entities:
        return name
    return block_name_lookup.get(name.casefold())


def space_id_for_layout_block(
    name: str,
    *,
    model_block_name: Optional[str],
    spaces_by_id: Dict[str, Dict[str, object]],
    space_from_block_name: Callable[[str], Tuple[str, str, str]],
) -> str:
    if model_block_name and name == model_block_name:
        if "model" not in spaces_by_id:
            spaces_by_id["model"] = {"id": "model", "display_name": "Model", "kind": "model"}
        return "model"
    sid, display_name, kind = space_from_block_name(name)
    if sid == "model":
        sid = f"layout:{name}"
        kind = "layout"
        display_name = name.lstrip("*") or "Layout"
    if sid not in spaces_by_id:
        spaces_by_id[sid] = {"id": sid, "display_name": display_name, "kind": kind}
    return sid


def append_space_entity(context: BlockExpansionContext, space_id: str, ent: Dict[str, object]) -> None:
    bucket = context.entities_by_space.setdefault(space_id, [])
    if len(bucket) < context.max_entities_per_space:
        ent_copy = dict(ent)
        ent_copy["space_id"] = space_id
        bucket.append(ent_copy)
    elif space_id not in context.capped_spaces:
        context.capped_spaces.add(space_id)
        context.warnings.append(
            f"Entity cap reached for {space_id}: only first {context.max_entities_per_space} entities loaded."
        )


def append_block_ref(context: BlockExpansionContext, space_id: str, block_ref: Dict[str, object]) -> None:
    context.block_refs_by_space.setdefault(space_id, []).append(block_ref)


def build_block_ref_entity(
    *,
    raw_insert: Dict[str, object],
    parent_tf: Affine2D,
    path_with_self: Tuple[str, ...],
    parent_block_id: Optional[str],
    effective_style: Dict[str, object],
    space_id: str,
    context: BlockExpansionContext,
    block_name_lookup: Dict[str, str],
) -> Optional[Dict[str, object]]:
    insert_geom = raw_insert.get("geom", {}) if isinstance(raw_insert.get("geom"), dict) else {}
    block_name = resolve_block_table_name(insert_geom.get("block_name"), context.block_entities, block_name_lookup) or str(insert_geom.get("block_name", "")).strip()
    if not block_name:
        return None
    position = insert_geom.get("position")
    if not isinstance(position, dict):
        position = {"x": 0.0, "y": 0.0, "z": 0.0}

    insert_tf = context.insert_transform_from_entity(raw_insert)
    world_insert_tf = context.compose_affine(parent_tf, insert_tf)
    world_pos = context.apply_affine(parent_tf, position)
    sx, sy = context.affine_scales(world_insert_tf)
    rotation_deg = math.degrees(math.atan2(world_insert_tf[2], world_insert_tf[0]))
    raw_scale = insert_geom.get("scale") if isinstance(insert_geom.get("scale"), dict) else {}
    scale_z = float(raw_scale.get("z", 1.0))

    block_ref_id = context.block_ref_id_from_instance_path(path_with_self)
    if not block_ref_id:
        return None

    bbox = context.apply_bbox_affine(parent_tf, raw_insert.get("bbox"))
    if bbox is None:
        bbox = {"min": dict(world_pos), "max": dict(world_pos)}

    insert_handle = str(raw_insert.get("id", "")).strip() or path_with_self[-1]
    return {
        "id": block_ref_id,
        "type": "BLOCK_REF",
        "handle": insert_handle,
        "layer": str(raw_insert.get("layer", "0")),
        "space_id": space_id,
        "parent_block_id": parent_block_id,
        "instance_path": list(path_with_self),
        "geom": {
            "block_name": block_name,
            "position": world_pos,
            "rotation": rotation_deg,
            "scale": {"x": sx, "y": sy, "z": scale_z},
            "insert_handle": insert_handle,
            "source_type": "BLOCK_REF",
        },
        "style": effective_style,
        "bbox": bbox,
    }


def expand_block_into_space(
    *,
    space_id: str,
    source_block_name: str,
    transform: Affine2D,
    stack: Tuple[str, ...],
    instance_path: Tuple[str, ...],
    parent_effective_color_index: Optional[int],
    parent_effective_color_rgb: Optional[str],
    parent_effective_lineweight_mm: Optional[float],
    context: BlockExpansionContext,
    block_name_lookup: Dict[str, str],
) -> None:
    if len(stack) > context.max_expand_depth:
        context.warnings.append(
            f"Block expansion depth exceeded ({context.max_expand_depth}) for {source_block_name}; deeper references were skipped."
        )
        return

    source_entities = context.block_entities.get(source_block_name, [])
    for raw_ent in source_entities:
        etype = str(raw_ent.get("type", "")).upper()
        raw_style = raw_ent.get("style", {})
        style_obj = raw_style if isinstance(raw_style, dict) else {"lineweight": "default"}
        raw_layer = str(raw_ent.get("layer", "0"))
        effective_style = context.resolve_effective_style(
            style_obj=style_obj,
            layer_name=raw_layer,
            layer_styles=context.layer_styles,
            parent_effective_color_index=parent_effective_color_index,
            parent_effective_color_rgb=parent_effective_color_rgb,
            parent_effective_lineweight_mm=parent_effective_lineweight_mm,
        )
        next_parent_color_idx = effective_style.get("effective_color_index")
        if not isinstance(next_parent_color_idx, int):
            next_parent_color_idx = None
        next_parent_color_rgb = str(effective_style.get("effective_color_rgb") or "").strip() or None
        next_parent_lineweight_mm = effective_style.get("effective_lineweight_mm")
        if not isinstance(next_parent_lineweight_mm, (int, float)) or not math.isfinite(float(next_parent_lineweight_mm)):
            next_parent_lineweight_mm = None
        elif float(next_parent_lineweight_mm) <= 0:
            next_parent_lineweight_mm = None
        else:
            next_parent_lineweight_mm = float(next_parent_lineweight_mm)

        if etype == "INSERT":
            geom = raw_ent.get("geom", {}) if isinstance(raw_ent.get("geom"), dict) else {}
            child_name_raw = str(geom.get("block_name", "")).strip()
            child_name = resolve_block_table_name(child_name_raw, context.block_entities, block_name_lookup) or child_name_raw
            if not child_name:
                continue
            if child_name in stack:
                if child_name not in context.cyclic_insert_names:
                    context.cyclic_insert_names.add(child_name)
                    context.warnings.append(f"Cyclic block reference detected for '{child_name}', skipped recursive expansion.")
                continue
            if child_name not in context.block_entities:
                if child_name not in context.unresolved_insert_names:
                    context.unresolved_insert_names.add(child_name)
                    context.warnings.append(f"Unresolved block reference '{child_name}', skipped.")
                continue
            insert_tf = context.insert_transform_from_entity(raw_ent)
            insert_id = str(raw_ent.get("id", "insert"))
            path_with_self = instance_path + (insert_id,)
            parent_block_id = context.block_ref_id_from_instance_path(instance_path)
            block_ref = build_block_ref_entity(
                raw_insert=raw_ent,
                parent_tf=transform,
                path_with_self=path_with_self,
                parent_block_id=parent_block_id,
                effective_style=effective_style,
                space_id=space_id,
                context=context,
                block_name_lookup=block_name_lookup,
            )
            if block_ref is not None:
                append_block_ref(context, space_id, block_ref)
            child_origin = context.block_origin_by_name.get(child_name, {"x": 0.0, "y": 0.0, "z": 0.0})
            child_origin_tf: Affine2D = (
                1.0,
                0.0,
                0.0,
                1.0,
                -float(child_origin.get("x", 0.0)),
                -float(child_origin.get("y", 0.0)),
            )
            child_tf = context.compose_affine(insert_tf, child_origin_tf)
            nested_tf = context.compose_affine(transform, child_tf)
            expand_block_into_space(
                space_id=space_id,
                source_block_name=child_name,
                transform=nested_tf,
                stack=stack + (child_name,),
                instance_path=path_with_self,
                parent_effective_color_index=next_parent_color_idx,
                parent_effective_color_rgb=next_parent_color_rgb,
                parent_effective_lineweight_mm=next_parent_lineweight_mm,
                context=context,
                block_name_lookup=block_name_lookup,
            )
            continue

        transformed = context.transform_entity(raw_ent, transform)
        if transformed is not None:
            base_id = str(transformed.get("id", ""))
            if instance_path:
                transformed["id"] = f"{base_id}@{'/'.join(instance_path)}"
            transformed["instance_path"] = list(instance_path)
            transformed["parent_block_id"] = context.block_ref_id_from_instance_path(instance_path)
            transformed["style"] = effective_style
            append_space_entity(context, space_id, transformed)
