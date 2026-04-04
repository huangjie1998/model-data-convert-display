// Next available MSG number is   8
// MODULE_ID ACLT1_DCL_

//     ACLT.DCL      for AutoCAD LT 3.0
//     First of 4 parts, based on ACAD.DCL.
//
//     Copyright (C) 1993, 1994, 1995, 1996 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.
// AutoCAD LT   DCL (Dialog Control Language)
// Define AutoCAD LT dialogs

// This file should not be modified when used with AutoCAD LT.
// Modification to the dialogue definitions can have serious adverse
// effects on the use of the product.  Since no modifications to this
// file are allowed, there should be no need for any internal error
// checking on the contents of this file, hence we disable audit checks
// by default.

// DDRMODES stuff follows.

acad_snap : dialog {
        label = "Drawing Aids";
        : row {
            : column {
                : boxed_column {
                    label = "Modes";
                    : toggle {
                        label = "&Ortho";
                        key = "ortho";
                    }
                    : toggle {
                        label = "Solid &Fill";
                        key = "fill";
                    }
                    : toggle {
                        label = "&Quick Text";
                        key = "qtext";
                    }
                    : toggle {
                        label = "&Blips";
                        key = "blips";
                    }
                    : toggle {
                        label = "Hi&ghlight";
                        key = "hilite";
                    }
                  : toggle {
                      label = "Gro&ups";
                      key = "group";
                  }
                  : toggle {
                      label = "Hat&ch";
                      key = "hatch";
                  }
               }
            }
            : boxed_column {
                label = "&Snap";
                : toggle {
                    label = "On";
                    key = "snap";
                }
                : edit12_box {
                    label = "&X Spacing";
                    key = "s_xsp";
                    errmsg = "Snap X Spacing";
                }
                : edit12_box {
                    label = "&Y Spacing";
                    key = "s_ysp";
                    errmsg = "Snap Y Spacing";
                }
                : edit12_box {
                    label = "Snap A&ngle";
                    key = "s_ang";
                    errmsg = "Snap Angle";
                }
                : edit12_box {
                    label = "X B&ase";
                    key = "xbase";
                    errmsg = "Snap X Base";
                }
                : edit12_box {
                    label = "Y Bas&e";
                    key = "ybase";
                    errmsg = "Snap Y Base";
                }
            }
            : column {
                : boxed_column {
                    label = "Gri&d";
                    fixed_height = true;
                    : toggle {
                        label = "On";
                        key = "grid";
                    }
                    : edit12_box {
                        label = "X S&pacing";
                        key = "g_xsp";
                        errmsg = "Grid X Spacing";
                    }
                    : edit12_box {
                        label = "Y Spac&ing";
                        key = "g_ysp";
                        errmsg = "Grid Y Spacing";
                    }
                }
                : boxed_column {
                    label = "Iso&metric Snap/Grid";
                    : toggle {
                        label = "On";
                        key = "iso";
                    }
                    : radio_row {
                        key = "isorad";
                        : radio_button {
                            label = "&Left";
                            key = "ileft";
                        }
                        : radio_button {
                            label = "&Top";
                            key = "itop";
                        }
                        : radio_button {
                            label = "&Right";
                            key = "iright";
                        }
                    }
                }
            }
       }
       ok_cancel_help_errtile;
}

//  DDRMODES stuff precedes.

lt_text: text {
    width = 25;
}

lt_image: image_button {
    height = 1;
    width = 15;
    allow_accept = true;
}

acad_tstyle : dialog {
    label = "Select Text Style";
    : row {
        : column {
            : list_box {
                key = "style_list";
                width = 16;
                height = 8;
                allow_accept = true;
            }
            : button {
                label = "Show &All...";
                key = "showall";
            }
        }
        : column {
            : image {
                key = "style_image";
                height = 7;
                width = 20;
            }
            : edit_box {
                key = "style_sample";
                label = "&Sample Text:";
                edit_width = 6;
                fixed_width = true;
                alignment = centered;
            }
        }
    }
    spacer;
    : edit_box {
        key = "style_edit";
        label = "Style &Name:";
        edit_width = 31;
        edit_limit = 217;
        fixed_width = true;
        allow_accept = true;
    }
    : row {
        : paragraph {
            : text_part {
                label = "Font:";
            }
            : text_part {
                label = "Height:";
            }
            : text_part {
                label = "Width:";
            }
            : text_part {
                label = "Oblique:";
            }
            : text_part {
                label = "Generation:";
            }
        }
        : paragraph {
            : text_part {
                key = "font";
                width = 32;
            }
            : text_part {
                key = "height";
                width = 32;
            }
            : text_part {
                key = "width";
                width = 32;
            }
            : text_part {
                key = "oblique";
                width = 32;
            }
            : text_part {
                key = "gen";
                width = 32;
            }
        }
    }
    ok_cancel_err;
}

acad_tstyle_sym : dialog {
    key = "acad_tstyle_sym";
    label = "Symbol Set";
    : text {
        key = "page";
        width = 10;
    }
    : image {
        key = "showall";
        color = graphics_background;
        height = 16;
        width = 70;
    }
    : row {
        : ok_button {
            is_cancel = true;
        }
        : button {
            label = "&Previous";
            key = "pagedown";
            width = 10;
        }
        : button {
            label = "&Next";
            key = "pageup";
            width = 10;
        }
    }
}

acad_icon: dialog {
        key = "label";
        initial_focus               = "listbox";
        : row {
            : list_box {
                width               = 20;
                height              = 21;
                fixed_height        = true;
                key                 = "listbox";
                allow_accept        = true;
            }
            : column {
                : row {
                    : icon_image {
                        key         = "icon1";
                    }
                    : icon_image {
                        key         = "icon2";
                    }
                    : icon_image {
                        key         = "icon3";
                    }
                    : icon_image {
                        key         = "icon4";
                    }
                }
                : row {
                    : icon_image {
                        key         = "icon5";
                    }
                    : icon_image {
                        key         = "icon6";
                    }
                    : icon_image {
                        key         = "icon7";
                    }
                    : icon_image {
                        key         = "icon8";
                    }
                }
                : row {
                    : icon_image {
                        key         = "icon9";
                    }
                    : icon_image {
                        key         = "icon10";
                    }
                    : icon_image {
                        key         = "icon11";
                    }
                    : icon_image {
                        key         = "icon12";
                    }
                }
                : row {
                    : icon_image {
                        key         = "icon13";
                    }
                    : icon_image {
                        key         = "icon14";
                    }
                    : icon_image {
                        key         = "icon15";
                    }
                    : icon_image {
                        key         = "icon16";
                    }
                }
                : row {
                    : icon_image {
                        key         = "icon17";
                    }
                    : icon_image {
                        key         = "icon18";
                    }
                    : icon_image {
                        key         = "icon19";
                    }
                    : icon_image {
                        key         = "icon20";
                    }
                }
/*
 *              : row {
 *                  : icon_image {
 *                      key         = "icon21";
 *                  }
 *                  : icon_image {
 *                      key         = "icon22";
 *                  }
 *                  : icon_image {
 *                      key         = "icon23";
 *                  }
 *                  : icon_image {
 *                      key         = "icon24";
 *                  }
 *              }
 */
            }
        }
        : row {
            : row {
                spacer_0;
                : row {
                    fixed_width = true;
                    : button {
                        label = "&Previous";
                        key = "prev";
                        width = 8;
                    }
                    :spacer {
                        width = 2;
                    }
                    :button {
                        label = "  &Next  ";
                        key = "next";
                        width = 8;
                    }
                }
                spacer_0;
            }
            spacer;
            ok_cancel;
        }
}

// Removed for LT 3.0 because Mtext no longer has access to these properties
//acad_mtprop_edit_box : edit_box {
//    edit_width = 20;
//    edit_limit = 30;
//}

// Removed for LT 3.0 because Mtext no longer has access to these properties
//acad_mtprop_popup_list : popup_list {
//    edit_width = 24;
//}

// Removed for LT 3.0 because Mtext no longer has access to these properties
//acad_mtprop : dialog {
//    label = "MText Properties";
//    :boxed_column {
//        label = "Contents";
//        :acad_mtprop_popup_list {
//            label = "Text &Style:";
//            key = "sty";
//        }
//        :acad_mtprop_edit_box {
//            label = "Text Hei&ght:";
//            key = "hgt";
//        }
//        :acad_mtprop_popup_list {
//            label = "&Direction:";
//            list = "Left to Right\nTop to Bottom";
//            key = "dir";
//        }
//    }
//    :boxed_column {
//        label = "Object";
//        :acad_mtprop_popup_list {
//            label = "&Attachment:";
//            list = "TopLeft\nTopCenter\nTopRight\nMiddleLeft\nMiddleCenter\nMiddleRight\nBottomLeft\nBottomCenter\nBottomRight";
//            key = "att";
//        }
//        :acad_mtprop_edit_box {
//            label = "&Width:";
//            key = "wid";
//        }
//        :acad_mtprop_edit_box {
//            label = "&Rotation:";
//            key = "rot";
//        }
//    }
//    ok_cancel_help_errtile;
//}

acad_plan6 : dialog {
    label = "UCS";
    : concatenation {
        : text_part {
            label = "Name: ";
        }
        : text_part {
            label = "*World*";
            key = "name";
            width = 40;
        }
    }
    : row {
        : boxed_column {
            label = "Origin";
            : concatenation {
                : text_part {
                    label = "X=";
                }
                : text_part {
                    key = "00";
                    width = 12;
                }
            }
            : concatenation {
                : text_part {
                    label = "Y=";
                }
                : text_part {
                    key = "10";
                    width = 12;
                }
            }
            : concatenation {
                : text_part {
                    label = "Z=";
                }
                : text_part {
                    key = "20";
                    width = 12;
                }
            }
        }
        : boxed_column {
            label = "X Axis";
            : concatenation {
                : text_part {
                    label = "X=";
                }
                : text_part {
                    key = "01";
                    width = 12;
                }
            }
            : concatenation {
                : text_part {
                    label = "Y=";
                }
                : text_part {
                    key = "11";
                    width = 12;
                }
            }
            : concatenation {
                : text_part {
                    label = "Z=";
                }
                : text_part {
                    key = "21";
                    width = 12;
                }
            }
        }
        : boxed_column {
            label = "Y Axis";
            : concatenation {
                : text_part {
                    label = "X=";
                }
                : text_part {
                    key = "02";
                    width = 12;
                }
            }
            : concatenation {
                : text_part {
                    label = "Y=";
                }
                : text_part {
                    key = "12";
                    width = 12;
                }
            }
            : concatenation {
                : text_part {
                    label = "Z=";
                }
                : text_part {
                    key = "22";
                    width = 12;
                }
            }
        }
        : boxed_column {
            label = "Z Axis";
            : concatenation {
                : text_part {
                    label = "X=";
                }
                : text_part {
                    key = "03";
                    width = 12;
                }
            }
            : concatenation {
                : text_part {
                    label = "Y=";
                }
                : text_part {
                    key = "13";
                    width = 12;
                }
            }
            : concatenation {
                : text_part {
                    label = "Z=";
                }
                : text_part {
                    key = "23";
                    width = 12;
                }
            }
        }
    }
    : ok_button {
        is_cancel = true;
    }
}

acad_plan : dialog {
    label = "UCS Control";
    initial_focus = "listbox";
    spacer;
    : list_box {
        label = "&UCS Names";
        tabs = "34";
        key = "listbox";
        width = 44;
        tab_truncate = true;
    }
    : row {
        : button {
            label = "&Current";
            key = "cur";
        }
        : button {
            label = "&Delete";
            key = "delete";
        }
        : button {
            label = "&List...";
            key = "list";
        }
    }
    : row {
        : button {
            label = "&Rename To:";
            key = "rename";
            fixed_width = true;
        }
        : edit_box {
            key = "rename_edit_box";
            edit_width = 28;
            edit_limit = 217;
        }
    }
    ok_cancel_help_errtile;
}

acad_txtedit : dialog {
    label = "Edit Text";
    initial_focus = "text_edit";
    : edit_box {
        label = "Text:";
        key = "text_edit";
        edit_width = 40;
        edit_limit = 2048;
        allow_accept = true;
    }
    ok_cancel;
}

acad_attedit : dialog {
    label = "Edit Attribute Definition";
    initial_focus = "tag_edit";
    : edit_box {
        key = "tag_edit";
        label = "Tag:";
        edit_width = 40;
        edit_limit = 2048;
    }
    : edit_box {
        key = "prompt_edit";
        label = "Prompt:";
        edit_width = 40;
        edit_limit = 2048;
    }
    : edit_box {
        key = "default_edit";
        label = "Default:";
        edit_width = 40;
        edit_limit = 2048;
    }
    ok_cancel;
    : errtile { width = 45; }
}


//  "Edit Attributes" / "Enter Attributes"  dialogue.

acad_ddatte : dialog {
    key = "ddatte";
    label = "Edit Attributes";  // Changes to "Enter Attributes" for
                                          // INSERT with ATTDIA set.
    initial_focus = "edit_1";
    : concatenation {
        : text_part {
            label = "Block Name: ";
        }
        : text_part {
            key = "block";
            width = 31;
        }
    }
    spacer_1;
    num_items = 8;                    // Customizable
    //  The number of prompt/edit pairs must match the "num_items" setting.
    : row {
        : text_25    { key = "prompt_1"; }
        : edit32_box { key = "edit_1"; }
    }
    : row {
        : text_25    { key = "prompt_2"; }
        : edit32_box { key = "edit_2"; }
    }
    : row {
        : text_25    { key = "prompt_3"; }
        : edit32_box { key = "edit_3"; }
    }
    : row {
        : text_25    { key = "prompt_4"; }
        : edit32_box { key = "edit_4"; }
    }
    : row {
        : text_25    { key = "prompt_5"; }
        : edit32_box { key = "edit_5"; }
    }
    : row {
        : text_25    { key = "prompt_6"; }
        : edit32_box { key = "edit_6"; }
    }
    : row {
        : text_25    { key = "prompt_7"; }
        : edit32_box { key = "edit_7"; }
    }
    : row {
        : text_25    { key = "prompt_8"; }
        : edit32_box { key = "edit_8"; }
    }
    : row {
        fixed_width = true;
        alignment = centered;
        ok_button;
        cancel_button;
        : retirement_button {
            key = "prev";
            label = "&Previous";
        }
        : retirement_button {
            key = "next";
            label = " &Next ";
        }
        help_button;
    }
    errtile;
}

acad_info : dialog {
    label = "Program Information";    // Overridden by caller
    key = "acad_info";
    initial_focus = "listbox";        // Don't want focus on LT's image button
    : row {
        : image_button {              // In ACAD_LT, it's a button
            key = "logo";
            width = 8;
            aspect_ratio = 1.0;
            fixed_height = true;
            alignment = top;
            color = dialog_background;
        }
        : paragraph {
            : text_part {
                key = "text1";
                width = 63;
            }
            : text_part {
                key = "text2";
                width = 63;
            }
            : text_part {
                key = "text3";
                width = 63;
            }
            : text_part {
                key = "text4";
                width = 63;
            }
            : text_part {
                key = "text5";
                width = 63;
            }
            : text_part {
                key = "text6";
                width = 63;
            }
            : text_part {
                key = "text7";
                width = 63;
            }
            : text_part {
                key = "text8";
                width = 63;
            }
            : text_part {
                key = "text9";
                width = 63;
            }
            : text_part {
                key = "text10";
                width = 63;
            }
        }
    }
    spacer;
    : list_box {
        width = 63;
        key = "listbox";
    }
    : ok_button {                     // Permit exit via either ENTER
        is_cancel = true;             //   or CTRL-C.
    }
}

init_view : dialog {

    key = "title";
    initial_focus = "listbox";
    : list_box {
        tabs = "33";
        width = 40;
        key = "listbox";
        allow_accept = true;
    }
    ok_cancel_err;
}

acad_plot : dialog {
    label = "Print / Plot Configuration";
    : row {
        : column {
            : boxed_column {
                label = "Device and Default Information";
                : text {
                    key = "userid";
                    width = 35;
                }
                : button {
                    label = "&Device and Default Selection...";
                    fixed_width = true;
                    key = "devsel";
                    alignment = centered;
                }
            }
            : boxed_row {
                label = "Pen Parameters";
                children_fixed_width = true;
                : button {
                    label = "&Pen Assignments...";
                    key = "assign";
                }
                : button {
                    label = "&Optimization...";
                    key = "optimize";
                }
            }
            : boxed_column {
                label = "Additional Parameters";
                : row {
                    : radio_column {
                        fixed_width = true;
                        : radio_button {
                            label = "Displa&y";
                            key = "D";
                        }
                        : radio_button {
                            label = "E&xtents";
                            key = "E";
                        }
                        : radio_button {
                            label = "&Limits";
                            key = "L";
                        }
                        : radio_button {
                            label = "&View";
                            key = "V";
                        }
                        : radio_button {
                            label = "&Window";
                            key = "W";
                        }
                    }
                    : column {
                        : edit12_box {
                            label = "Text Resolution";
                            key = "textreso";
                            errmsg = "Text Resolution";
                        }
                        : toggle {
                            label = "Text Fill";
                            key = "textfill";
                        }
                        : toggle {
                            label = "Hide&-Lines";
                            key = "hide";
                        }
                        : toggle {
                            label = "Ad&just Area Fill";
                            key = "plfill";
                        }
                        : toggle {
                            label = "Plot To &File";
                            key = "file";
                        }
                    }
                }
                : row {
                    alignment = centered;
                    : button {
                        label = "Vi&ew...";
                        key = "view";
                        fixed_width = true;
                    }
                    : button {
                        label = "Wi&ndow...";
                        key = "selwind";
                        fixed_width = true;
                    }
                    : button {
                        label = "File N&ame...";
                        key = "sfile";
                        fixed_width = true;
                    }
                }
            }
        }
        : column {
                : boxed_column {
                    label = "Paper Size and Orientation";
                    : row {
                        : radio_column {
                            fixed_width = true;
                            : radio_button {
                                label = "In&ches";
                                key = "I";
                            }
                            : radio_button {
                                label = "&MM";
                                key = "M";
                            }
                        }
                        : row {
                            fixed_width = true;
                            : button {
                                label = "Si&ze...";
                                key = "sizbuttn";
                                fixed_width = true;
                            }
                            : text {
                                key = "size";
                                width = 6;
                            }
                            : column {
                                spacer;
                                : image {
                                    key = "vec_image";
                                    width = 4.0;
                                    fixed_width = true;
                                    aspect_ratio = 1.0;
                                    color = dialog_background;
                                }
                                spacer;
                            }
                        }
                    }
                    : text {
                        key = "area";
                        width = 25;
                    }
                }
                : boxed_column {
                    label = "Scale, Rotation, and Origin";
                    : button {
                        label = "Rotation and Ori&gin...";
                        key = "rot&or";
                        alignment = centered;
                        fixed_width = true;
                    }
                    : row {
                        : column {
                            children_fixed_width = true;
                            : text {
                                key = "pu";
                                width = 14;
                                alignment = right;
                            }
                            : edit_box {
                                edit_width = 10;
                                key = "punit";
                                alignment = centered;
                            }
                        }
                        : column {
                            children_fixed_width = true;
                            children_alignment = centered;
                            : text {
                                label = "=";
                            }
                            : text {
                                label = "=";
                            }
                        }
                        : column {
                            children_fixed_width = true;
                            : text {
                                label = "Drawing Units";
                            }
                            : edit_box {
                                edit_width = 10;
                                key = "dunit";
                                alignment = centered;
                            }
                        }
                    }
                    : toggle {
                        label = "Scaled to Fi&t";
                        key = "fit";
                    }
                }
                : boxed_column {
                    label = "Plot Preview";
                    : row {
                        children_fixed_width = true;
                        : button {
                            label = "P&review...";
                            key = "prev";
                        }
                        : radio_row {
                            : radio_button {
                                label = "Part&ial";
                                key = "earea";
                            }
                            : radio_button {
                                label = "F&ull";
                                key = "full";
                            }
                        }
                    }
                }
        }
    }
    ok_cancel_help;
    : row {
        : errtile { fixed_width = true; }

        // This spacer_0 between the two fixed-width items serves
        // to left-justify the first and right-justify the second,
        // since it's the only flexible-width item in the row.
        spacer_0;

        : row {
            fixed_width = true;
            : text {
                key = "zero";
                width = 3;
            }
            : image {
                key = "pre_image";
                color = dialog_background;
                height = 1;
                width = 18;
            }
            : text {
                key = "comp";
                width = 5;
            }
        }
    }
}

acad_plwin : dialog {
    label = "Window Selection";
        : button {
            label = "&Pick <";
            key = "pick";
            fixed_width = true;
        }
            : boxed_row {
                label = "&First Corner";
                : edit_box {
                    label = "   X:";
                    key = "fpx";
                    edit_width = 10;
                }
                : edit_box {
                    label = "   Y:";
                    key = "fpy";
                    edit_width = 10;
                }
            }
            : boxed_row {
                label = "&Other Corner";
                : edit_box {
                    label = "   X:";
                    key = "spx";
                    edit_width = 10;
                }
                : edit_box {
                    label = "   Y:";
                    key = "spy";
                    edit_width = 10;
                }
            }
        ok_cancel_err;
}

acad_plopt : dialog {
    aspect_ratio = 0;
    label = "Optimizing Pen Motion";
    : column {
        : toggle {
            label = "&No optimization";
            key = "0";
        }
        : toggle {
            label = "Adds &endpoint swap";
            key = "1";
        }
        : toggle {
            label = "Adds &pen sorting";
            key = "2";
        }
        : toggle {
            label = "Adds &limited motion optimization";
            key = "3";
        }
        : toggle {
            label = "Adds &full motion optimization";
            key = "4";
        }
        : toggle {
            label = "&Adds elimination of overlapping horizontal or vertical vectors";
            key = "5";
        }
        : toggle {
            label = "A&dds elimination of overlapping diagonal vectors";
            key = "6";
        }
    }
    ok_cancel;
}

acad_plsize : dialog {
    label = "Paper Size";
    : row {
        : column {
            : concatenation {
                : text_part {
                    label = "&Size";
                    width = 8;
                }
                : text_part {
                    label = "Width";
                    width = 9;
                }
                : text_part {
                    label = "Height";
                }
            }
            : list_box {
                key = "listbox";
                tabs = "0 8 17";
                width = 28;
                height = 13;
            }
        }
        spacer_1;
        : column {
            : row {
                : text_part {
                    label = "Size";
                    width = 8;
                }
                : text_part {
                    label = "Width";
                    width = 11;
                }
                : text_part {
                    label = "Height";
                }
            }
            spacer_0;
            : row {
                : text_part {
                    label = "&USER:";
                    width = 8;
                }
                : edit_box {
                    key = "0w";
                    edit_width = 10;
                }
                : edit_box {
                    key = "0h";
                    label = " ";
                    edit_width = 10;
                }
            }
            : row {
                : text_part {
                    label = "USER&1:";
                    width = 8;
                }
                : edit_box {
                    key = "1w";
                    edit_width = 10;
                }
                : edit_box {
                    key = "1h";
                    label = " ";
                    edit_width = 10;
                }
            }
            : row {
                : text_part {
                    label = "USER&2:";
                    width = 8;
                }
                : edit_box {
                    key = "2w";
                    edit_width = 10;
                }
                : edit_box {
                    label = " ";
                    key = "2h";
                    edit_width = 10;
                }
            }
            : row {
                : text_part {
                    label = "USER&3:";
                    width = 8;
                }
                : edit_box {
                    key = "3w";
                    edit_width = 10;
                }
                : edit_box {
                    label = " ";
                    key = "3h";
                    edit_width = 10;
                }
            }
            : row {
                : text_part {
                    label = "USER&4:";
                    width = 8;
                }
                : edit_box {
                    key = "4w";
                    edit_width = 10;
                }
                : edit_box {
                    label = " ";
                    key = "4h";
                    edit_width = 10;
                }
            }
            : row {
                : column {
                    spacer_1;
                    : row {
                        alignment = left;
                        : text_part {
                            label = "Orientation is";
                            fixed_width = true;
                        }
                        : text_part {
                            key = "land";
                            width = 12;
                        }               
                    }
                    spacer;
                }
                : column {
                    spacer;
                    : image {
                        key = "vec_image";
                        width = 4.0;
                        fixed_width = true;
                        aspect_ratio = 1.0;
                        color = dialog_background;
                    }
                    spacer;
                } 
            }
        }
    }
    ok_cancel_err;
}

acad_plpen : dialog {
    label = "Pen Assignments";
    : column {
        : row {
            : paragraph {
                : concatenation {
                    : text_part {
                        label = "Color    Pen No.";
                        key = "1";
                        width = 20;
                    }
                    : text_part {
                        label = "Linetype";
                        key = "2";
                        width = 11;
                    }
                    : text_part {
                        label = "Speed";
                        key = "3";
                        width = 7;
                    }
                    : text_part {
                        label = "Pen Width";
                        key = "4";
                    }
                }
                : list_box {
                    key = "listbox";
                    tabs = "2 11 22 32 38";
                    width = 50;
                    multiple_select = true;
                }
            }
            : boxed_column {
                label = "Modify Values";
                : row {
                    : text_part {
                        label = "Color:";
                        width = 7;
                        fixed_width = true;
                    }
                    : image {
                        key = "color_image";
                        width = 4.0;
                        height = 0.5;
                    }
                }
                : text {
                    width = 13;
                    key = "varies";
                }
                : row {
                    : text_part {
                        label = "&Pen:";
                        width = 7;
                        fixed_width = true;
                    }
                    : edit_box {
                        key = "penno";
                        edit_width = 8;
                    }
                }
                : row {
                    : text_part {
                        label = "&Ltype:";
                        width = 7;
                        fixed_width = true;
                    }
                    : edit_box {
                        key = "ltype";
                        edit_width = 8;
                    }
                }
                : row {
                    : text_part {
                        label = "&Speed:";
                        width = 7;
                        fixed_width = true;
                    }
                    : edit_box {
                        key = "speed";
                        edit_width = 8;
                    }
                }
                : row {
                    : text_part {
                        label = "&Width:";
                        width = 7;
                        fixed_width = true;
                    }
                    : edit_box {
                        key = "width";
                        edit_width = 8;
                    }
                }
            }
        }
        : row {
            : button {
                label = "&Feature Legend...";
                key = "legend";
                fixed_width = true;
            }
        }
    }
    ok_cancel_err;
}

acad_plpre : dialog {
    label = "Preview Effective Plotting Area";
        : image {
            key = "pimage";
            height = 11.25;
            width = 25;
            fixed_width = true;
            fixed_height = true;
            alignment = centered;
        }
        : row {
            : image {
                key = "cpaper";
                width = 2.0;
                color = red;
                height = 0.1;
                fixed_width = true;
                fixed_height = true;
            }
            : text {
                key = "paper";
                width = 50;
            }
        }
        : row {
            : image {
                key = "earea";
                width = 2.0;
                color = blue;
                height = 0.1;
                fixed_width = true;
                fixed_height = true;
            }
            : text {
                key = "area";
                width = 50;
            }
        }
        : row {
            : image {
                key = "clip";
                width = 2.0;
                height = 0.1;
                fixed_width = true;
                fixed_height = true;
            }
            : text {
                key = "cliptxt";
                width = 50;
            }
        }
        : text {
            width = 50;
            key = "warn";
        }
        : list_box {
            height = 3;
            key = "listbox";
        }
    ok_button;
}

acad_plok : dialog {
   label = "Plot Preview";
   : column {
       width = 15;
       : button {
           label = "&Pan and Zoom";
           key = "zoomd";
       }
       : button {
           key = "accept";
           label = "&End Preview";
           is_cancel = true;
       }
   }
}

acad_plokcan : dialog {
    label = "Plot Preview";
    : column {
        width = 15;
        : button {
            label = "&Zoom Previous";
            key = "zoomd";
        }
        : button {
            key = "accept";
            label = "&End Preview";
            is_cancel = true;
        }
    }
}

acad_devdesc : dialog {
    label = "Describe Device";
    : column {
        : text {
            label = "AutoCAD LT needs a description of the device so you can find it later.";
        }
        : edit_box {
            label = "Description:";
            key = "desc";
        }       
    }
    ok_cancel;
}

acad_devinf : dialog {
    label = "Device and Default Selection";
    : boxed_column {
                label = "Select a Device Configuration";
                : list_box {
                        key = "listbox";
                        width = 60;
                        height = 6;
                        tabs = "36";
                }
                : concatenation {
                        : text_part {
                        label = "Manufacturer: ";
                        fixed_width = true;
                        width = 14;
                        }
                        : text_part {
                        key = "device";
                        width = 50;
                        }
                }
                : concatenation {
                        : text_part {
                        label = "Port: ";
                        width = 6;
                        }
                        : text_part {
                        key = "port";
                        width = 50;
                        }
                }
    }
    : boxed_row {
                label = "Configuration File";
            : column {
                    : text {
                            label = "Complete (PC2)";
                alignment = centered;
                    }
            : row {
                        : button {
                                label = "S&ave...";
                                key = "savepc2";
                        }
                        : button {
                                label = "&Replace...";
                                key = "loadpc2";
                        }
            }
            }
        spacer_0;
        : column {
                    : text {
                            label = "Partial (PCP - LT R2/LT 95)";
                alignment = centered;
                    }
            : row {
                        : button {
                                label = "&Save...";
                                key = "sfile";
                        }
                        : button {
                                label = "&Merge...";
                                key = "ffile";
                        }
            }
        }
    }
    : boxed_row {
                label = "Device Specific Configuration";
                : text_part {
                        label = "Device Requirements: ";
                        width = 35;
                }
                : button {
                        label = "Sh&ow...";
                        key = "showreq";
                        is_enabled = false;
                }
                : button {
                        label = "&Change...";
                        key = "cfgreq";
                        is_enabled = false;
                }
    }
    ok_cancel_help_errtile;
}

acad_plferr : dialog {
    label = "Error Information On File Defaults";
    : list_box {
        width = 62;
        height = 8;
        key = "listbox";
    }
    : row {
        spacer_0;
        : row {
            fixed_width = true;
            : button {
                key = "save";
                label = "&Create Error File";
            }
            : spacer {
                width = 2;
            }
            ok_button;
        }
        spacer_0;
    }
    errtile;
}

acad_rotor : dialog {
    label = "Plot Rotation and Origin";
    : boxed_radio_row {
        label = "Plot Rotation";
        : radio_button {
            label = "&0";
            key = "0";
        }
        : radio_button {
            label = "&90";
            key = "90";
        }
        : radio_button {
            label = "&180";
            key = "180";
        }
        : radio_button {
            label = "&270";
            key = "270";
        }
    }
    : boxed_row {
        label = "Plot Origin";
        : edit_box {
            label = "&X Origin:";
            key = "originx";
            edit_width = 10;
        }
        : edit_box {
            label = "&Y Origin:";
            key = "originy";
            edit_width = 10;
        }
    }
    spacer;
    ok_cancel_err;
}


acad_dwgmod : dialog {
   label = "Drawing Modification";
   initial_focus = "save";
   : column {
       : text {
           label = "The current drawing has been changed.";
           alignment = centered;
       }
       : row {
           : button {
               label = "&Save Changes...";
               is_default = true;
               key = "save";
           }
           : button {
               label = "&Discard Changes";
               key = "discard";
           }
           : button {
               label = "&Cancel Command";
               is_cancel = true;
               key = "cancel";
           }
       }
   }
}

acad_reinit : dialog {
    label = "Re-initialization";
    : boxed_column {
        label = "I/O Port Initialization";
        : row {
            : toggle {
                label = "&Digitizer";
                key = "1";
                value = "0";
            }
            : toggle {
                label = "&Plotter";
                key = "2";
                value = "0";
            }
        }
    }
    : boxed_column {
        label = "Device and File Initialization";
        : toggle {
            label = "Di&gitizer";
            key = "g";
            value = "0";
        }
        : toggle {
            label = "Di&splay";
            key = "s";
            value = "0";
        }
        : toggle {
            label = "PGP &File";
            key = "p";
            value = "0";
        }
    }
    ok_cancel;
}

f0 : dialog {
  label = "Boundary Hatch";
  f0guts;
}

f0he : dialog {
  label = "Hatch Edit";
  f0guts;
}

f0guts : column {
  : row {
    : column {
      : boxed_row {
        label = "Pattern T&ype";
        : column {
            fixed_height = true;
            : button {
                label = "Patte&rn...";
                key = "pattern_palette";
            }
            : popup_list {
                key = "pattern_type";
                edit_width = 15;
                popup_height = 3;
                list = "Predefined\nUser-defined\nCustom\n";
            }
        }
        : image_button {
            // This should match 'icon_image' in base.dcl in order to match the
            //  bitmaps in 'pattern_palette'.
            color        = 0;
            width        = 11;
            aspect_ratio = 0.66;
            allow_accept = true;
            fixed_height = true;
            fixed_width  = true;
            alignment    = centered;
            key = "pattern_img";
            allow_accept = false;
        }
      }
      : boxed_row {
        label = "Pattern Properties";
        : column {
          isopwidth;
          : popup_list {
            label = "Patter&n:";
            edit_width = 12;
            popup_height = 3;
            key = "pattern_name";
          }
          : edit_box {
            label = "&Custom Pattern:";
            key = "pattern_custom";
            edit_width = 12;
          }
          : edit_box {
            label = "Sca&le:  ";
            key = "hatch_scale";
            edit_width = 12;
          }
          : edit_box {
            label = "&Angle:";
            edit_width = 12;
            key = "hatch_angle";
          }
          : edit_box {
            label = "&Spacing:";
            key = "hatch_spacing";
            edit_width = 12;
          }
          spacer;
          : toggle {
            label = "Do&uble";
            key = "d_hatch";
          }
        }
      }
    }
    : column {
      children_width = 18;
      children_fixed_width = true;
      children_alignment = centered;
      : boxed_column {
        label = "Boundary";
        spacer;
        : button {
          label = "Pick &Points <";
          key = "pick_bound";
        }
        : button {
          label = "Select &Objects <";
          key = "select";
        }
        : button {
          label = "&Remove Islands <";
          key = "rem_islands";
        }
        : button {
          label = "Vie&w Selections <";
          key = "look_at_it";
        }
        spacer;
        : button {
          label = "A&dvanced...";
          key = "options";
        }
      }
      spacer;
      : column {
        children_alignment = left;
        : button {
          label = "Preview Ha&tch <";
          key = "preview";
          width = 24;
        }
        : button {
          label = "&Inherit Properties <";
          key = "inherit";
          width = 24;
        }
        spacer;
        : boxed_column {
          label = "Attributes";
          : toggle {
            label = "Associati&ve";
            key = "assoc";
          }
          : toggle {
            label = "&Exploded";
            key = "explode";
          }
        }
      }
      spacer;
    }
  }
  : row {
    fixed_width = true;
    alignment = centered;
    spacer;
    : button {
      key = "accept";
      is_default = true;
      label = "Apply";
      width = 8;
    }
    spacer;
    : button {
      key = "cancel";
      label = "Cancel";
      width = 8;
      is_cancel = true;
    }
    spacer;
    : button {
      key = "help";
      label = "&Help";
      width = 8;
    }
    spacer;
  }
  errtile;
}

acad_wait : dialog {
   key = "title";
   initial_focus = "accept";
   width = 25;
   spacer; 
   : column {    
       fixed_width = true;  
       fixed_height = true;
       alignment = centered;
       : button {
           key = "accept";
           label = "&Continue";
           is_cancel = true;
       }
    }
    spacer;
}


f1guts : column {
    aspect_ratio = 0;
    : row {
        : boxed_column {
            label = "Define Boundary Set";
            : button {
                label = "Make &New Boundary Set <";
                key = "make_select";
            }
            : radio_column {
                key = "use";
                : radio_button {
                    label = "From E&verything on Screen";
                    key = "use_all";
                    value = "1";
                }
                : radio_button {
                    label = "From E&xisting Boundary Set";
                    key = "use_old_select";
                }
            }
            : toggle {
                label = "Island &Detection";
                key = "islands";
            }
        }
        : boxed_column {
          label = "Boundary Style";
          alignment = top;
          : image_button {
            alignment = centered;
            color = 0;
            aspect_ratio = 0.8;
            width = 10;
            key = "icon_noi";
            fixed_width = true;
            fixed_height = true;
          }
          : popup_list {
            label = "&Style:";
            key = "hatch_style";
            edit_width = 11;
            popup_height = 3;
            list = "Normal\nOuter\nIgnore\n";
          }
          spacer;
        }
    }
    : boxed_column {
        label = "Boundary Options";
        : row {
            : toggle {
                label = "Retain &Boundaries";
                key = "retain";
            }
           : popup_list {
                label = "&Object Type:";
                list = "Region\nPolyline\n";
                key = "bpoly_type";
                edit_width = 11;
            }
        }
        spacer;
    }
}


f1 : dialog {
    label = "Advanced Options";
    f1guts;
    spacer;
    ok_cancel;
    : errtile { width = 30; }
}



f2 : dialog {
    label = "Boundary Creation";
    initial_focus = "accept";
   : column {
        : popup_list {
            label = "&Object Type:";
            list = "Region\nPolyline\n";
            key = "bpoly_type";
            edit_width = 11;
            fixed_width = true;
        }
        spacer;
        : boxed_column {
            label = "Define Boundary Set";
            : radio_column {
                key = "use";
                : radio_button {
                    label = "From E&verything on Screen";
                    key = "use_all";
                    value = "1";
                }
                : radio_button {
                    label = "From E&xisting Boundary Set";
                    key = "use_old_select";
                }
            }
            : big_button {
                label = "Make &New Boundary Set <";
                key = "make_select";
                alignment = centered;
            }
            spacer;
        }
        spacer;
        : toggle {
            label = "Island &Detection";
            key = "islands";
        }
    }
    spacer;
    pick_cancel;
    errtile;
}

fh_open : dialog {
    label = "Boundary Definition Error";
    initial_focus = "accept";
    width = 30;
    spacer;
    : column {
        fixed_width = true;
        fixed_height = true;
        alignment = centered;
        : text {
            horizontal_alignment = centered;
            label = "Boundary is not closed.";
        }
    }
    spacer_1;
    ok_look;
    spacer;
}


fh_outside : dialog {
    aspect_ratio = 0;
    label = "Boundary Definition Error";
    initial_focus = "accept";
    width = 30;
    spacer;
    : column {
        fixed_width = true;
        fixed_height = true;
        alignment = centered;
        : text {
            horizontal_alignment = centered;
            label = "Point is outside of boundary.";
        }
    }
    spacer_1;
    ok_look;
    spacer;
}


fh_on : dialog {
    aspect_ratio = 0;
    label = "Boundary Definition Error";
    initial_focus = "accept";
    width = 30;
    spacer;
    : column {
        fixed_width = true;
        fixed_height = true;
        alignment = centered;
        : text {
            horizontal_alignment = centered;
            label = "Point is directly on an object.";
        }
    }
    spacer_1;
    ok_look;
    spacer;
}


fh_dup : dialog {
    aspect_ratio = 0;
    label = "Boundary Definition Error";
    initial_focus = "accept";
    width = 30;
    spacer;
    : column {
        fixed_width = true;
        fixed_height = true;
        alignment = centered;
        : text {
            horizontal_alignment = centered;
            label = "Boundary duplicates an existing boundary.";
        }
    }
    spacer_1;
    ok_only;
    spacer;
}


fh_awful : dialog {
    aspect_ratio = 0;
    label = "Boundary Definition Error";
    initial_focus = "accept";
    width = 30;
    spacer;
    : column {
        fixed_width = true;
        fixed_height = true;
        alignment = centered;
        : text {
            horizontal_alignment = centered;
            label = "Valid hatch boundary not found.";
        }
    }
    spacer_1;
    ok_only;
    spacer;
}


fh_nohatch : dialog {
    aspect_ratio = 0;
    label = "Hatching Error";
    width = 30;
    spacer;
    : column {
        fixed_width = true;
        fixed_height = true;
        alignment = centered;
        : text {
            horizontal_alignment = centered;
            label = "No hatching was created";
        }
    }
    spacer_1;
    ok_only;
    spacer;
}


fh_toodense : dialog {
    aspect_ratio = 0;
    label = "Hatching Error";
    width = 30;
    spacer;
    : column {
        fixed_width = true;
        fixed_height = true;
        alignment = centered;
        : text {
            horizontal_alignment = centered;
            label = "Hatch spacing too dense, or dash size too small.";
        }
    }
    spacer_1;
    ok_only;
    spacer;
}


falert : dialog {
    label = "ALERT";
    spacer;
    : text {
        key = "alert_text_1";
        horizontal_alignment = centered;
        width = 50;
    }
    : text {
        key = "alert_text_2";
        horizontal_alignment = centered;
        width = 50;
    }
    spacer_1;
    ok_only;
    spacer;
}

big_button :button{
    fixed_width = true;
    width = 25;
}


look_button : retirement_button {
    label           = "&Look at it";
    key             = "look";
    vertical_alignment = centered;
}


ok_look : column {
    : row {
        fixed_width = true;
        alignment = centered;
        : ok_button { is_cancel = true; } 
        : spacer { width = 2; }
        look_button;
    }
}


next_button : button {
        label           = "&Next";
        key             = "next";
        fixed_width     = true;
        width           = 9;
        vertical_alignment = centered;
        horizontal_alignment = centered;
}


prev_button : button {
        label           = "&Previous";
        key             = "previous";
        fixed_width     = true;
        width           = 9;
        vertical_alignment = centered;
        horizontal_alignment = centered;
}


pick_cancel : column {
    : row {
        fixed_width = true;
        alignment = centered;
        : button { 
            label = "&Pick Points <";
            key = "accept";
            is_default = true;
        }
        : spacer { width = 1; }
        cancel_button;
        : spacer { width = 1; }
        help_button;
    }
}

//
// support functions
//

isopwidth : popup_list {
    label = "&ISO Pen Width:";
    list = " \n0.13 mm\n0.18 mm\n0.25 mm\n0.35 mm\n0.5 mm\n0.7 mm\n1.0 mm\n1.4 mm\n2.0 mm\n";
    popup_height = 3;
    key = "isopenwidth";
    edit_width = 12;
}

text_35 : text {
    width = 35;
}

acad_group : dialog {
    label = "Object Grouping";
    initial_focus = "name";
    : column {
        : concatenation {
            : text_part {
                label = "Grou&p Name";
                width = 32;
            }
            : text_part {
                label = "Selectable";
            }
        }                                                                      
        : list_box {
            tabs = "36";
            key = "grp_list";
            width = 48;
            height = 5;
            tab_truncate = true;
        }
    }
    :row {
            : boxed_column {
                label = "Group Identification";
                : column {
                    vertical_margin = tiny;
                    : row {
                        : text_part {
                            label = "&Group Name:";
                            width = 13;
                        }
                        : edit_box {
                            key = "name";
                            edit_width = 32;
                            edit_limit = 217;
                        }
                    }
                    : row {
                        : text_part {
                            label = "&Description:";
                            width = 13;
                        }
                        : edit_box {
                            key = "desc";
                            edit_width = 32;
                            edit_limit = 448;
                        }
                    }
                }
                : row {
                    children_fixed_width = true;
                    : button {
                        label = "&Find Name <";
                        key = "find";
                    }
                    : button {
                        label = "&Highlight <";
                        key = "h_light";
                    }
                    : toggle {
                        label = "&Include Unnamed";
                        key = "anon";
                    }
                }        
            }
            : boxed_column {
                label = "Create Group";
                    alignment = centered;
                    : button {
                        label = "&New <";
                        key = "add_new";
                    }
                    : toggle {
                        label = "&Selectable";
                        value = "1";
                        key = "select";
                    }
                    : toggle { 
                        label = "&Unnamed";
                        value = "0";
                        key = "unnamed";
                }
        }    
    }
    : boxed_column {
        label = "Change Group";
        key = "chg_column";
        : row {
            : button {
                label = "&Remove <";
                key = "remove";
            }
            : button {
                label = "&Add <";
                key = "add";
            }
            : button {
                label = "Rena&me";
                key = "rename";
            }
            : button {
                label = "Re-&order...";
                key = "order";
            }
        }
        : row {
            : button {
                label = "&Description";
                key = "chg_desc";
            }
            : button {
                label = "&Explode";
                key = "explode";
            }
            : button {
                label = "Se&lectable";
                key = "chg_select";
            }
        }
    }
    ok_cancel_help_errtile;
}

 
acad_grp_order : dialog {
    label = "Order Group";
    : column {
        vertical_margin = none;
        : text {
            label = "&Group Name";
        }
        : list_box {
            key = "grp_list";
            width = 35;
            height = 6;
        }
    }
    : boxed_column {
        label = "&Description"; 
        : text {
            key = "desc";
            width = 32;
        }
    }           
    : boxed_column {
        children_fixed_width = true;
        : row {
            : text {
                key = "remove";
                width = 35;
                horizontal_alignment = right;
            }
            : edit_box {
                edit_width = 10;
                key = "from";
                horizontal_alignment = left;
            }
        }
        : row {
            : text {
                key = "replace";
                width = 35;
                horizontal_alignment = right;
            }
            : edit_box {
                edit_width = 10;
                key = "to";
                horizontal_alignment = left;
            }
        }
        : row {
            : text {
                key = "qtext";
                width = 35;
                horizontal_alignment = right;
            }
            : edit_box {
                edit_width = 10;
                key = "quantity";
                horizontal_alignment = left;
            }
        }
    }
    : row {
        key = "action";
        : button {
            label = "&Re-Order";
            key = "reorder";
        }
        : button {
            label = "&Highlight";
            key = "hlight";
        }
        : button {
            label = "Reverse &Order";
            key = "reverse";
        }
    }
    ok_cancel_help_errtile;
}
 
acad_grp_member : dialog {
    label = "Group Member List"; 
    initial_focus = "accept";
    : list_box {
        key = "listbox";
        width = 35;
        height = 8;
        fixed_width = true;
    }
    spacer;
    : ok_button {
        is_cancel = true;
    }
}

acad_msg : dialog {
   label = "Object Grouping"; 
   width = 30;
   : row {
       next_button;
       prev_button;
   }
   spacer_1;
   : ok_button {
       is_cancel = true;
   } 
   errtile; 
}

ddfcf : dialog {
  label        = "Geometric Tolerance";
  :row {
      : boxed_column {
          label = "Sym";
          children_fixed_height = true;
          children_fixed_width = true;
          : text {
             label = "";
          }
          spacer_1;
          : fcf_ibut {
             key         = "sym11";
          }
          spacer_1;
          : fcf_ibut {
             key         = "sym21";
          }
      }
      : boxed_column {
          label = "Tolerance 1";
          children_fixed_height = true;
          children_fixed_width = true;
          : text {
              label = "Dia  Value    MC";
          }
          spacer_1;
          : row {
              : fcf_ibut {
                  key         = "sym12";
              }
              : fcf_ebox {
                  key         = "ebox11";
              }
              : fcf_ibut {
                  key         = "sym13";
              }
          }
          spacer_1;
          : row {
              : fcf_ibut {
                  key         = "sym22";
              }
              : fcf_ebox {
                  key         = "ebox21";
              }
              : fcf_ibut {
                  key         = "sym23";
              }
          }
      }

      : boxed_column {
          label = "Tolerance 2";
          children_fixed_height = true;
          children_fixed_width = true;
          : text {
              label = "Dia  Value    MC";
          }
          spacer_1;
          : row {
               : fcf_ibut {
                   key         = "sym14";
               }
               : fcf_ebox {
                   key         = "ebox12";
               }
               : fcf_ibut {
                   key         = "sym15";
               }
          }
          spacer_1;
          : row {
              : fcf_ibut {
                  key         = "sym24";
              }
              : fcf_ebox {
                  key         = "ebox22";
              }
              : fcf_ibut {
                  key         = "sym25";
              }
          }
      }

      : boxed_column {
          label = "Datum 1";
          children_fixed_height = true;
          children_fixed_width = true;
          : text {
              label = "Datum MC";
          }
          spacer_1;
          : row {
              : fcf_ebox1 {
                  key         = "ebox13";
              }
              : fcf_ibut {
                  key         = "sym16";
              }
          }
          spacer_1;
          : row {
              : fcf_ebox1 {
                  key         = "ebox23";
              }
              : fcf_ibut {
                  key         = "sym26";
              }
          }
      }

      : boxed_column {
          label = "Datum 2";
          children_fixed_height = true;
          children_fixed_width = true;
          : text {
              label = "Datum MC";
          }
          spacer_1;
          : row {
              : fcf_ebox1 {
                  key         = "ebox14";
              }
              : fcf_ibut {
                  key         = "sym17";
              }
          }
          spacer_1;
          : row {
              : fcf_ebox1 {
                  key         = "ebox24";
              }
              : fcf_ibut {
                  key         = "sym27";
              }
          }
      }

      : boxed_column {
          label = "Datum 3";
          children_fixed_height = true;
          children_fixed_width = true;
          : text {
              label = "Datum MC";
          }
          spacer_1;
          : row {
              : fcf_ebox1 {
                  key         = "ebox15";
              }
              : fcf_ibut {
                  key         = "sym18";
              }
          }
          spacer_1;
          : row {
              : fcf_ebox1 {
                  key         = "ebox25";
              }
              : fcf_ibut {
                  key         = "sym28";
              }
          }
      }
  }
  spacer_1;
  : column {
      children_fixed_height = true;
      : row {
          fixed_width = true;
          : text {
               label = "Height";
          }
          : fcf_ebox {
              key         = "ebox31";
          }
          : text {
               label = "Projected Tolerance Zone";
          }
          : fcf_ibut {
              key         = "sym31";
          }
      }
      spacer_1;
      : row {
          fixed_width = true;
          : text {
               label = "Datum Identifier";
          }
          : fcf_ebox {
              key         = "ebox32";
          }
      }
  }
  spacer_1;
  ok_cancel_help_errtile;
}

ddfcfsub: dialog {
  label        = "Symbol";
  : column {
   : row {
      : fcf_ibut1 {
        key          = "gdtj";      /* Position */
      }
      : fcf_ibut1 {
        key          = "gdtr";      /* Circularity */
      }
      : fcf_ibut1 {
        key          = "gdti";      /* Symmetry */
      }
      : fcf_ibut1 {
        key          = "gdtf";      /* Parallel */
      }
      : fcf_ibut1 {
        key          = "gdtb";       /* Perpendicular */
      }
    }
    : row {
      : fcf_ibut1 {
        key          = "gdta";      /* Angular */
      }
      : fcf_ibut1 {
        key          = "gdtg";      /* Cylindricity */
      }
      : fcf_ibut1 {
        key          = "gdtc";       /* Flatness */
      }
      : fcf_ibut1 {
        key          = "gdte";      /* Circularity */
      }
      : fcf_ibut1 {
        key          = "gdtu";      /* Straightness    */
      }
    }
    : row {
      : fcf_ibut1 {
        key          = "gdtd";      /* Profile of a surface */
      }
      : fcf_ibut1 {
        key          = "gdtk";      /* Line Profile */
      }
      : fcf_ibut1 {
        key          = "gdth";      /* Circular Runout */
      }
      : fcf_ibut1 {
        key          = "gdtt";      /* Total Runout    */
      }
      : fcf_ibut1 {
        key          = "gdt-";      /* Nothing */
      }
    }
  }
  spacer_1;
  ok_cancel_help_errtile;
}

ddfcfsub1: dialog {
  label        = "Material Condition";
  : row {
      : fcf_ibut1 {
       key          = "gdtm";   /* Maximum */
      }
      : fcf_ibut1 {
       key          = "gdtl";   /* Least */
      }
      : fcf_ibut1 {
       key          = "gdts";   /* Regardless of feature size */
      }
      : fcf_ibut1 {
       key          = "gdt-";   /* Nothing */
      }
  }
  spacer_1;
  ok_cancel_help_errtile;
}


spelldlg : dialog {
    label = "Check Spelling";
    initial_focus = "sp_suggedit";
    : row {
        : text {
            label = "Current dictionary: ";
        }
        : text {
            key = "sp_currlang";
            width = 32;
            fixed_width = true;
        }
    }
    spacer;
    : row {
        : boxed_column {
          label = "Current word";
          : text {
              label = "";
              key = "sp_word";
              width = 32;
          }
          spacer;
        }
        : column {
            : cancel_button {
                width = 10;
            }
            : help_button {
                width = 10;
            }
        }
    }
    spacer;
    : text {
        label = "&Suggestions:";
    }
    : row {
        : column {
            width = 20;
            : edit_box {
                key = "sp_suggedit";
                edit_limit = 63;
            }
             : list_box {
                key = "sp_sugglist";
                multiple_select = false;
                height = 6;
            }
        }
        children_alignment = top;
        children_fixed_height = true;
        : column {
            : row {
                : button {
                    label = "&Ignore";
                    key = "sp_ignore";
                    width = 12;
                    fixed_width = true;
                    is_default = true;
                }
                : button {
                    label = "I&gnore All";
                    key = "sp_ignoreall";
                    width = 20;
                    fixed_width = false;
                }
            }
            : row {
                : button {
                    label = "&Change";
                    key = "sp_change";
                    width = 12;
                    fixed_width = true;
                }
                : button {
                    label = "Chang&e All";
                    key = "sp_changeall";
                    width = 20;
                    fixed_width = false;
                }
            }
            : row {
                : button {
                    label = "&Add";
                    key = "sp_addcustom";
                    width = 12;
                    fixed_width = true;
                }
                : button {
                    label = "&Lookup";
                    key = "sp_lookup";
                    width = 20;
                    fixed_width = false;
                }
            }
            spacer_1;
            : button {
                label = "Change &Dictionaries...";
                key = "sp_changedict";
            }
        }
    }
    spacer;
    : boxed_column {
        label = "Context";
        : text {
            label = "";
            key = "sp_context";
            width = 32;
        }
        spacer;
    }
    errtile;
}


spelloptdlg : dialog {
    label = "Change Dictionaries";
    initial_focus = "sp_suggedit";
    : row {
        : boxed_column {
            label = "&Main dictionary";
            : popup_list {
               key = "sp_mainname";
               edit_width = 28;
            }
        }
        spacer_1;
        : column {
            ok_button;
            cancel_button;
            help_button;
        }
    }
    spacer;
    : boxed_column {
        fixed_width = true;
        width = 32;
        label = "&Custom dictionary";
        : edit_box {
            key = "sp_customname";
            edit_limit = 256;
        }
        : button {
            fixed_width = true;
            width = 10;
            alignment = centered;
            label = "&Browse...";
            key = "sp_browse";
        }
    }
    : boxed_column {
        label = "Custom dictionary &words";
        : row {
            : column {
                : edit_box {
                    key = "sp_custedit";
                    width = 30;
                    edit_limit = 63;
                }
                : list_box {
                    key = "sp_customwords";
                    multiple_select = false;
                    height = 6;
                }
            }
            children_alignment = top;
            children_fixed_height = true;
            : column {
                : button {
                    label = "&Add";
                    key = "sp_custadd";
                }
                : button {
                    label = "&Delete";
                    key = "sp_custdel";
                }
            }
        }
    }
    errtile;
}


// mstyle - main dialogue:

mstyle : dialog {
    label = "Multiline Styles";
    children_alignment = centered;
    :boxed_row {
        label = "Multiline Style";
        width = 42; fixed_width = true;
        :column {
            : row {
                : text_part {
                    label = "Current:";
                    width = 13;
                }
                : popup_list {
                    key = "current";
                    edit_width = 31;
                    edit_limit = 31;
                }
            }
            : row {
                : text_part {
                    label = "Name:";
                    width = 13;
                }
                : edit_box {
                    key = "name";
                    edit_width = 31;
                    edit_limit = 217;
                }
            }
            : row {
                : text_part {
                    label = "Description:";
                    width = 13;
                }
                : edit_box {
                    key = "description";
                    edit_width = 31;
                    edit_limit = 255;
                }
            }
            :row {
                :button {
                    label = "Load...";
                    key = "load";
                }
                :button {
                    label = "Save...";
                    key = "save";
                }
                :button {
                    label = "Add";
                    key = "addStyle";
                }
                :button {
                    label = "Rename";
                    key = "rename";
                }
            }
        }
    }
    spacer_1;
    :image {
        key = "mline_image";
        height = 4;
        width = 45;
        alignment = centered;
        fixed_width = true;
    }
    :button {
        fixed_width = true;
        width = 32;
        height = 2;
        label = "Element Properties ...";
        key = "elements";
    }
    :button {
        fixed_width = true;
        width = 32;
        height = 2;
        label = "Multiline Properties ...";
        key = "properties";
    }
    spacer_1;
    ok_cancel_help_errtile;
}

//==================================================================
// mstyle - elements dialogue:

estyle : dialog {
     label = "Element Properties";
     : concatenation {
         : text_part {
              label = "Elements:";
              width = 10;
              fixed_width = true;
         }
         : text_part {
              label = "Offset";
              width = 8;
              fixed_width = true;
         }
         : text_part {
              label = "Color";
              width = 8;
              fixed_width = true;
         }
         : text_part {
              label = "Ltype";
              fixed_width = true;
         }
     }
     : row {
       : spacer {
         width = 9;
       }
       : list_box {
         width = 40;
         height = 4;
         key = "list_of_lines";
         tabs = "8 16";
       }
     }
     : row {
          fixed_width = true;
          : button {
               fixed_width = true;
               label = "Add";
               key = "addLine";
          }
          : button {
               fixed_width = true;
               label = "Delete";
               key = "delLine";
          }
          : spacer { width = 3; }
          : edit_box {
              fixed_width = true;
              label = "Offset";
              key = "offSet";
              value = "0.00";
              edit_width = 6; edit_limit = 6;
          }
     }
     : row {
          fixed_width = true;
          : button {
              fixed_width = true;
              width = 12;
              label = "Color...";
              key = "lineColDialog";
           }
           : image_button {
              fixed_width = true;
              key = "lineColSwash";
              height = 2; width = 5;
           }
           : edit_box {
              fixed_width = true;
              key = "lineColEdit";
              value = "BYLAYER";
              edit_width = 10;
              edit_limit = 10;
           }
     }

     : row {
          fixed_width = true;
          : button {
               fixed_width = true;
               width = 12;
               label = "Linetype...";
               key = "setLineStyle";
          }
          : spacer {
              fixed_width = true;
               width = 6;
          }
          : text {
              fixed_width = true;
               key = "ltype_name";
               value = "BYLAYER";
               width = 10;
          }
     }
     ok_cancel_help; 
     errtile;
}

//==================================================================
// mstyle - styles list dialogue:

sstyle : dialog {
     label = "Load Multiline Styles";
     :row {
         :button {
            label = "File ...";
            key = "mstyleFileBut";
         }
         : text {
            key = "mstyleFileLabel";
            width = 31;
         }
      }
     : list_box {
         width = 40;
         height = 4;
         key = "list_of_styles";
       }
    ok_cancel_help_errtile;
}

//==================================================================
// mstyle - properties dialogue:

pstyle : dialog {
  label = "Multiline Properties";
  : row {
    fixed_width = true;
    : toggle {
      label = "Display joints";
      key = "dispJoint";
    }
  }
  : boxed_column {
    label = "Caps";
    : row {
      fixed_width = true;
      : spacer {
        width = 12;
      }
      : text {
        label = "Start";
        width = 9;
      }
      : text {
        label = "End";
      }
    }
    : row {
      fixed_width = true;
      : text {
        label = "Line";
        width = 12;
      }
      : toggle {
        key   = "scapline";
      }
      : spacer {
        width = 5;
      }
      : toggle {
        key   = "ecapline";
      }
    }
    : row {
      fixed_width = true;
      : text {
        label = "Outer arc";
        width = 12;
      }
      : toggle {
        key   = "scapoarc";
      }
      : spacer {
        width = 5;
      }
      : toggle {
        key   = "ecapoarc";
      }
    }
    : row {
      fixed_width = true;
      : text {
        label = "Inner arcs";
        width = 12;
      }
      : toggle {
        key   = "scapiarc";
      }
      : spacer {
        width = 5;
      }
      : toggle {
        key   = "ecapiarc";
      }
    }
    : row {
      fixed_width = true;
      : text {
        label = "Angle";
        width = 12;
      }
      : edit_box {
        key   = "scapangle";
        edit_limit = 10;
        edit_width = 10;
        fixed_width = true;
        value = "90.0";
      }
      : spacer {
        width = 2;
      }
      : edit_box {
        key   = "ecapangle";
        edit_limit = 10;
        edit_width = 10; fixed_width = true;
        value = "90.0";
      }
    }

  }
  : boxed_row {
    label = "Fill";
    : toggle {
      key = "fillOn";
      label = "On";
    }
    : spacer { width = 2; }
    : button {
      label = "Color...";
      key = fillColor;
    }
    : image_button {
      key = "fillColSwash";
      height = 2; width = 5; fixed_width = true;
    }
    : edit_box {
      key = "filColEdit";
      edit_limit = 10;
      edit_width = 10;
      fixed_width = true;
    }
  }
  ok_cancel_help;
      
  errtile;
}

//==================================================================
// mledit.dcl
//
// 
// Prototype layout for mline edit tools.


//==================================================================
// mledit - main dialogue:

mledit : dialog {

  label = "Multiline Edit Tools";
  : row {
        : image_button {
           key = "medit_cc";
           width = 7;
           height = 3;
           fixed_width = true;
        }
        : image_button {
           key = "medit_ct";
           width = 7;
           height = 3;
           fixed_width = true;
        }
        : image_button {
           key = "medit_cj";
           width = 7;
           height = 3;
           fixed_width = true;
        }
        : image_button {
           key = "medit_cs";
           width = 7;
           height = 3;
           fixed_width = true;
        }
   }
   : row {
        : image_button {
           key = "medit_oc";
           width = 7;
           height = 3;
           fixed_width = true;
        }
        : image_button {
           key = "medit_ot";
           width = 7;
           height = 3;
           fixed_width = true;
        }
        : image_button {
           key = "medit_av";
           width = 7;
           height = 3;
           fixed_width = true;
        }
        : image_button {
           key = "medit_ca";
           width = 7;
           height = 3;
           fixed_width = true;
        }
   }
   : row {
        : image_button {
           key = "medit_mc";
           width = 7;
           height = 3;
           fixed_width = true;
        }
        : image_button {
           key = "medit_mt";
           width = 7;
           height = 3;
           fixed_width = true;
        }
        : image_button {
           key = "medit_dv";
           width = 7;
           height = 3;
           fixed_width = true;
        }
        : image_button {
           key = "medit_wa";
           width = 7;
           height = 3;
           fixed_width = true;
        }
   }
   ok_cancel_help;
   errtile;
}

block_equal : dialog {
  key = "block_equal";
  label = "Substitute Block Name";
    : text {
      label = "The file you have chosen can not be used as a block name";
      alignment = centered;
    }
    : edit_box {
        label = "New Block Name:";
        key = "blockname";
        edit_width = 31;
        edit_limit = 31;
        alignment = centered;
        allow_accept = true;
    }
    ok_cancel_err;

} 

//  Continues in ACLT2.DCL

// Next available MSG number is   1
// MODULE_ID ACLT2_DCL_

//     ACLT.DCL      Version 13.0 for AutoCAD LT 3.0
//     Second of 4 parts
//
//     Copyright (C) 1993, 1994, 1995 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.
// AutoCAD DCL (Dialog Control Language)
// Define AutoCAD dialogs

// This file should not be modified when used with AutoCAD.
// Modification to the dialogue definitions can have serious adverse
// effects on the use of the product.  Since no modifications to this
// file are allowed, there should be no need for any internal error
// checking on the contents of this file, hence we disable audit checks
// by default.


// Bmake.dcl - Block make using entmake with a dialogue interface.

bmake : dialog {
    label = "Block Definition";
    : edit_box {
        label = "&Block name:";
        key = "bname";
        edit_limit = 31;
    }
    spacer;
    : row {
        : boxed_column { 
            label = "Base Point";
            : button {
                label = "Select &Point <";
                key = "pick_pt";                 
            }
            : edit_box {
                label = "&X:";
                key = "x_pt";
                edit_width = 10;
            }
            : edit_box {
                label = "&Y:";
                key = "y_pt";
                edit_width = 10;
            }
            : edit_box {
                label = "&Z:";
                key = "z_pt";
                edit_width = 10;
            }
        }
        : column {
            spacer_1;
            : button {
                label = "&Select Objects <";
                key = "sel_objs";                 
            }
            : concatenation {
                : text_part {
                    label = "Number found: ";
                }
                : text_part {
                    key = "how_many";
                    width = 5;
                }
             }
             spacer;
             : button {
                 label = "&List Block Names...";
                 key = "list_blocks";
             }
             : toggle {
                 label = "&Retain Objects";
                 key = "retain";
             }
         }
    }
   spacer; 
   spacer;
   ok_cancel_help_errtile;
}

bmake_bname_exists : dialog {
    label = "Warning";
    : paragraph {
        : text_part {
            label = "A Block with this name already exists in the drawing.";
        }
        : text_part {
            label = "Do you want to redefine it?";
        }
    }
    spacer_1;
    : row {
        fixed_width = true;
        alignment = centered;
        : button {
            label = "&Redefine";
            key = "yes";
            width = 8;
        }
        : spacer {
            width = 2;
        }
        : default_button {
            label = "Cancel";
            key = "no";
            width = 8;
        }
    }
}

bmake_list_blocks : dialog {
    label = "Block Names In This Drawing";
    : edit_box {
        label = "&Pattern:";
        key = "pattern";
    }
    : list_box {                                   
        key = "bl_match";
        width = 32;
//      multiple_select = true;
//      allow_accept = true;
    }
    spacer;
    ok_only;
}

// BMAKE stuff precedes.

//  DDMODIFY stuff follows.

//-------- Subassemblies and prototypes shared across several dialogues -------

ddmod_common_fields : column {
    : boxed_row {
        label = "Properties";
        : column {
            : row {
                fixed_width = true;
                : button {
                    label = "Color...";
                    mnemonic = "C";
                    key = "b_color";
                    width = 15;
                    fixed_width = true;
                }
                : image_button {
                    key = "show_image";
                    height = 1;
                    width = 3;
                }
                : text {
                    key = "t_color";
                    width = 12;
                }
            }
            : row {
                fixed_width = true;
                : button {
                    label = "Layer...";
                    mnemonic = "L";
                    key = "b_name";
                    width = 15;
                    fixed_width = true;
                }
                : text {
                    key = "t_layer";
                    width = 16;
                }
            }
            : row {
                fixed_width = true;
                : button {
                    label = "Linetype...";
                    mnemonic = "i";
                    key = "b_line";
                    width = 15;
                }
                : text {
                    key = "t_ltype";
                    width = 16;
                }
           }
        }
        spacer_1;
        : column {
            fixed_width = true;
            ddmod_handle_assembly;
            : row {
                : text_part {
                    label = "Thickness:";
                    mnemonic = "T";
                    key = "b_thickness";
                    width = 16;
                    fixed_width = true;
                }
                : edit_box {
                    key = "eb_thickness";
                    edit_width = 15;
                }
            }
            : row {
                : text_part {
                    label = "Linetype Scale:";
                    mnemonic = "S";
                    width = 16;
                    fixed_width = true;
                }
                : edit_box {
                    key = "eb_ltscale";
                    edit_width = 15;
                }
            }
        }
    }
    spacer;
}

ddmod_num_box : edit_box {
    edit_width = 10;
}

ddmod_pk_pt_button : button {
    label = "Pick Point <";
    alignment = centered;
}

ddmod_pk_pt_1_button : ddmod_pk_pt_button {
    key = "pick_1";
    mnemonic = "P";
}
ddmod_pk_pt_2_button : ddmod_pk_pt_button {
    key = "pick_2";
    mnemonic = "k";
}
ddmod_pk_pt_3_button : ddmod_pk_pt_button {
    key = "pick_3";
    mnemonic = "o";
}
ddmod_pk_pt_4_button : ddmod_pk_pt_button {
    key = "pick_4";
    mnemonic = "n";
}

ddmod_x_box : ddmod_num_box {
    label = "X:";
    mnemonic = "X";
}
ddmod_y_box : ddmod_num_box {
    label = "Y:";
    mnemonic = "Y";
}
ddmod_z_box : ddmod_num_box {
    label = "Z:";
    mnemonic = "Z";
}

ddmod_x1_box : ddmod_x_box {
    key = "x1_pt";
}
ddmod_x2_box : ddmod_x_box {
    key = "x2_pt";
}
ddmod_x3_box : ddmod_x_box {
    key = "x3_pt";
}
ddmod_x4_box : ddmod_x_box {
    key = "x4_pt";
}

ddmod_y1_box : ddmod_y_box {
    key = "y1_pt";
}
ddmod_y2_box : ddmod_y_box {
    key = "y2_pt";
}
ddmod_y3_box : ddmod_y_box {
    key = "y3_pt";
}
ddmod_y4_box : ddmod_y_box {
    key = "y4_pt";
}

ddmod_z1_box : ddmod_z_box {
    key = "z1_pt";
}
ddmod_z2_box : ddmod_z_box {
    key = "z2_pt";
}
ddmod_z3_box : ddmod_z_box {
    key = "z3_pt";
}
ddmod_z4_box : ddmod_z_box {
    key = "z4_pt";
}
// Xline/Ray edit boxes.
ddmod_xline_x1 : ddmod_x_box {
    key = "xline_x1";
}
ddmod_xline_y1 : ddmod_y_box {
    key = "xline_y1";
}
ddmod_xline_z1 : ddmod_z_box {
    key = "xline_z1";
}
ddmod_xline_x2 : ddmod_x_box {
    key = "xline_x2";
}
ddmod_xline_y2 : ddmod_y_box {
    key = "xline_y2";
}
ddmod_xline_z2 : ddmod_z_box {
    key = "xline_z2";
}

ddmod_handle_assembly : row {
    : text {
        label = "Handle:";
        width = 16;
        fixed_width = true;
    }
    // width = width of thickness/ltscale edit boxes - 3;
    : text {
        key = "Handle";
        width = 12;
    }
}

ddmod_dimedit_column : column {
    fixed_width = true;
    fixed_height = true;
    : button {
        label = "Edit...";
        mnemonic = "d";
        key = "mod_text";
        height = 2;
    }
    ddmod_dimedit_mod_style;
}

ddmod_dimedit_mod_style : popup_list {
    label = "Style: ";
    mnemonic = "e";
    key = "mod_style";
    width = 32;
    list = "";
}

//-------------------- Dialogues --------------------

ddmod_mline : dialog {
    label = "Modify Multiline";
    ddmod_common_fields;
    : row {
      : concatenation {
         : text_part {
             label = "MLine Style: ";
             width = 12;
         }
         : text_part {
             key = "ml_style";
             width = 33;
             fixed_width = true;
         }
      }
      spacer_1;
    }
    spacer;
    : row { 
        alignment = centered;
        fixed_width = true;
        ok_cancel_help;
    }
    errtile;
}

ddmod_xline : dialog {
    label = "Modify Xline";
    ddmod_common_fields;
    spacer;
    : row {
        : boxed_column {
            label = "Root Point";
            fixed_width = true;
            ddmod_pk_pt_1_button;
            ddmod_xline_x1;
            ddmod_xline_y1;
            ddmod_xline_z1;
        }
        : boxed_column {
            label = "Second Point";
            fixed_width = true;
            ddmod_pk_pt_2_button;
            ddmod_xline_x2;
            ddmod_xline_y2;
            ddmod_xline_z2;
        }
        : boxed_column {
            label = "Direction Vector";
               spacer_1;
                : concatenation {
                    : text_part {
                        label = " X:";
                        width = 4;
                    }
                    : text_part {
                        key = "dir_x";
                        width = 10;
                    }
                }
                : concatenation {
                    : text_part {
                        label = " Y:";
                        width = 4;
                    }
                    : text_part {
                        key = "dir_y";
                        width = 10;
                    }
                }
                : concatenation {
                    : text_part {
                        label = " Z:";
                        width = 4;
                    }
                    : text_part {
                        key = "dir_z";
                        width = 10;
                    }
                }
                spacer_1;
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_ray : dialog {
    label = "Modify Ray";
    ddmod_common_fields;
    spacer;
    : row {
        : boxed_column {
            label = "Start Point";
            fixed_width = true;
            ddmod_pk_pt_1_button;
            ddmod_xline_x1;
            ddmod_xline_y1;
            ddmod_xline_z1;
        }
        : boxed_column {
            label = "Second Point";
            fixed_width = true;
            ddmod_pk_pt_2_button;
            ddmod_xline_x2;
            ddmod_xline_y2;
            ddmod_xline_z2;
        }
        : boxed_column {
            label = "Direction Vector";
               spacer_1;
                : concatenation {
                    : text_part {
                        label = " X:";
                        width = 4;
                    }
                    : text_part {
                        key = "dir_x";
                        width = 10;
                    }
                }
                : concatenation {
                    : text_part {
                        label = " Y:";
                        width = 4;
                    }
                    : text_part {
                        key = "dir_y";
                        width = 10;
                    }
                }
                : concatenation {
                    : text_part {
                        label = " Z:";
                        width = 4;
                    }
                    : text_part {
                        key = "dir_z";
                        width = 10;
                    }
                }
                spacer_1;
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_point : dialog {
    label = "Modify Point";
    ddmod_common_fields;
    spacer;
    : row {
        fixed_width = true;
        : boxed_column {
            label = "Location";
            fixed_width = true;
            ddmod_pk_pt_1_button;
            ddmod_x1_box;
            ddmod_y1_box;
            ddmod_z1_box;
        }
        spacer;
        : column {
            alignment = top;
            fixed_height = true;
            spacer_1;
        }
    }
    ok_cancel_help_errtile;
}

ddmod_line : dialog {
    label = "Modify Line";
    ddmod_common_fields;
    spacer;
    : row {
        : boxed_column {
            label = "From Point";
            fixed_width = true;
            ddmod_pk_pt_1_button;
            ddmod_x1_box;
            ddmod_y1_box;
            ddmod_z1_box;
        }
        : boxed_column {
            label = "To Point";
            fixed_width = true;
            ddmod_pk_pt_2_button;
            ddmod_x2_box;
            ddmod_y2_box;
            ddmod_z2_box;
        }
        : column {
            : text {
                label = "Delta XYZ: ";
            }
            : column {
                fixed_height = true;
                : concatenation {
                    : text_part {
                        label = " X:";
                        width = 4;
                    }
                    : text_part {
                        key = "delta_x";
                        width = 14;
                    }
                }
                : concatenation {
                    : text_part {
                        label = " Y:";
                        width = 4;
                    }
                    : text_part {
                        key = "delta_y";
                        width = 14;
                    }
                }
                : concatenation {
                    : text_part {
                        label = " Z:";
                        width = 4;
                    }
                    : text_part {
                        key = "delta_z";
                        width = 14;
                    }
                }
            }
            spacer_0;
            : column {
                fixed_height = true;
                : concatenation {
                    : text_part {
                        label = "Length: ";
                        width = 8;
                    }
                    : text_part {
                        key = "l_length";
                        width = 14;
                    }
                }
                fixed_height = true;
                : concatenation {
                    : text_part {
                        label = "Angle: ";
                        width = 8;
                    }
                    : text_part {
                        key = "l_angle";
                        width = 10;
                    }
                }
            }
        }
    spacer_1;
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_ellipse : dialog {
    label = "Modify Ellipse";
    ddmod_common_fields;
    : row {
        fixed_width = true;
        : boxed_column {
            label = "Center";
            fixed_width = true;
            ddmod_pk_pt_1_button;
            ddmod_x1_box;
            ddmod_y1_box;
            ddmod_z1_box;
        }
        spacer;
        : column {
            fixed_height = true;
            : ddmod_num_box {
                label = "Major Radius:";
                mnemonic = "M";
                key = "majrad";
            }
            : ddmod_num_box {
                label = "Minor Radius:";
                mnemonic = "N";
                key = "minrad";
            }
            : row {
                : column {
                    : text {
                        label = "Radius Ratio:";
                    }
                }
                : column {
                    : text {
                        key = "rratio";
                        width = 11;
                    }
                }
            } 
            : ddmod_num_box {
                label = "Start Angle:";
                mnemonic = "S";
                key = "st_ang";
            }
            : ddmod_num_box {
                label = "End Angle:";
                mnemonic = "E";
                key = "end_eang";
            }
        }
        : column {
            : boxed_column {
                label = "Major Axis Vector";
                fixed_width = true;
                : row {
                    : column {
                        : text {
                            label = "X:";
                        }
                        : text {
                            label = "Y:";
                        }
                        : text {
                            label = "Z:";
                        }
                    }
                    : column {
                        : text {
                            key = "Majraddirx";
                            width = 11;
                        }
                        : text {
                            key = "Majraddiry";
                            width = 11;
                        }
                        : text {
                            key = "Majraddirz";
                            width = 11;
                        }
                    }
                }
            }
            : column {
                fixed_height = true;
                : row {
                    : column {
                        : text {
                            label = "Area: ";
                            key = "Area_text";
                        }
                    }
                    : column {
                        : text {
                            key = "Area";
                            width = 20;
                        }
                    }
                }
            }
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_spline : dialog {
    label = "Modify Spline";
    ddmod_common_fields;
    : row {
        : boxed_column {
            label = "Control Points";
            fixed_width = true;
            : row {
                : column {
                    vertical_margin = wide;
                    : concatenation {
                        : text_part {
                            label = "Vertex:";
                        }
                        : text_part {
                            key = "cntl_ctr";
                            width = 4;
                        }
                    }
                }
                : column {
                    : button {
                        label = "Next";
                        mnemonic = "N";
                        key = "next_cntlpt";
                    }
                }
            }
            : concatenation {
                : text_part {
                  label = "X: ";
                }
                : text_part {
                  key = "xtext";
                  width = 10;
                }
            }
            : concatenation {
                : text_part {
                  label = "Y: ";
                }
                : text_part {
                  key = "ytext";
                  width = 10;
                }
            }
            : concatenation {
                : text_part {
                  label = "Z: ";
                }
                : text_part {
                  key = "ztext";
                  width = 10;
                }
            }
            : concatenation {
                : text_part {
                  label = "Weight: ";
                  key = "weight_text";
                }
                : text_part {
                  key = "weight";
                  width = 10;
                }
            }
        }
        : column {
            fixed_height = true;
            : row {
               : column {
                   : text {
                       label = "      ";
                   }
                   : text {
                       label = "Degree:";
                   }
                   : text {
                       label = "Properties";
                   }
                   : text {
                       label = "      ";
                   }
                   : text {
                       label = "      ";
                   }
                   : text {
                       label = "      ";
                   }
                   : text {
                       label = "      ";
                   }
               }
               : column {
                   : text {
                       label = "    ";
                   }
                   : text {
                       key = "Degree";
                       width = 11;
                   }
                   : text {
                       key = "SpProp1";
                       width = 12;
                   }
                   : text {
                       key = "SpProp2";
                       width = 12;
                   }
                   : text {
                       key = "SpProp3";
                       width = 12;
                   }
                   : text {
                       key = "SpProp4";
                       width = 12;
                   }
                   : text {
                       key = "SpProp5";
                       width = 12;
                   }
               }
            }
        }
        : boxed_column {
            label = "Data Points";
            fixed_width = true;
            key = "data_pts";
            : row {
                : column {
                    vertical_margin = wide;
                    : concatenation {
                        : text_part {
                            label = "Vertex:";
                        }
                        : text_part {
                            key = "data_ctr";
                            width = 4;
                        }
                    }    
                }
                : column {
                    : button {
                        label = "Next";
                        mnemonic = "N";
                        key = "next_datapt";
                    }
                }
            }    
            : concatenation {
                : text_part {
                  label = "X: ";
                }
                : text_part {
                  key = "dxtext";
                  width = 10;  
                }
            }    
            : concatenation {
                : text_part {
                  label = "Y: ";
                }
                : text_part {
                  key = "dytext";
                  width = 10;
                }
            }
            : concatenation {
                : text_part {
                  label = "Z: ";
                }
                : text_part {
                  key = "dztext";
                  width = 10;
                }
            }
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_circle : dialog {
    label = "Modify Circle";
    ddmod_common_fields;
    spacer;
    : row {
        fixed_width = true;
        : boxed_column {
            label = "Center";
            fixed_width = true;
            ddmod_pk_pt_1_button;
            ddmod_x1_box;
            ddmod_y1_box;
            ddmod_z1_box;
        }
        spacer;
        : column {
            fixed_height = true;
            : text {
               label = "   ";
            }
            : ddmod_num_box {
                label = "Radius:";
                mnemonic = "R";
                key = "radius";
            }
            : row {
                : column {
                    : text { label = "Diameter:";      }
                    : text { label = "Circumference:"; }
                    : text { label = "Area: ";         }
                }
                : column {
                    : text { 
                        width = 11;
                        key = "Dia";
                        alignment = right;
                    }
                    : text {
                        width = 11;
                        key = "Circum";
                        alignment = right;
                    }
                    : text {
                        width = 20;
                        key = "Area";
                        alignment = right;
                    }
                }
            }
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_arc : dialog {
    label = "Modify Arc";
    ddmod_common_fields;
    spacer;
    : row {
        fixed_width = true;
        : boxed_column {
            label = "Center";
            fixed_width = true;
            ddmod_pk_pt_1_button;
            ddmod_x1_box;
            ddmod_y1_box;
            ddmod_z1_box;
        }
        spacer;
        : column {
            fixed_width = true;
            : text {
               label = "   ";
            }
            : ddmod_num_box {
                label = "Radius: ";
                mnemonic = "R";
                key = "radius";
            }
            : ddmod_num_box {
                label = "Start Angle: ";
                mnemonic = "A";
                key = "st_ang";
            }
            : ddmod_num_box {
                label = "End Angle: ";
                mnemonic = "E";
                key = "end_ang";
            }
            : concatenation {
                : text_part {
                  label = "Total Angle: ";
                  width = 14;
                }
                : text_part {
                  key = "tot_angle";
                  width = 10;
                }
            }
        }
        spacer;
        : column {
            fixed_height = true;
            fixed_width = true;
            alignment = top;
            : text {
                label = "   ";
            }
            : concatenation {
                : text_part {
                    label = "Arc Length: ";
                    width = 13;
                }
                : text_part {
                    key = "arclen";
                    width = 8;
                }
            }
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_solid : dialog {
    label = "Modify Solid";
    ddmod_common_fields;
    spacer;
    : row {
        children_alignment = top;
        children_fixed_width = true;
        children_fixed_height = true;
        : column {
            : boxed_column {
                label = "Point 1";
                ddmod_pk_pt_1_button;
                ddmod_x1_box;
                ddmod_y1_box;
            }
        }
        : boxed_column {
            label = "Point 2";
            ddmod_pk_pt_2_button;
            ddmod_x2_box;
            ddmod_y2_box;
        }
        : boxed_column {
            label = "Point 3";
            ddmod_pk_pt_3_button;
            ddmod_x3_box;
            ddmod_y3_box;
        }
        : boxed_column {
            label = "Point 4";
            ddmod_pk_pt_4_button;
            ddmod_x4_box;
            ddmod_y4_box;
            ddmod_z4_box;
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_block : dialog {
    label = "Modify Block Insertion";
    ddmod_common_fields;
    spacer;
    : concatenation {
       : text_part {
           label = "Block Name: ";
           width = 12;
       }
       : text_part {
           key = "Bl_name";
           width = 33;
       }
    }
    spacer;
    : row {
        fixed_width = true;
        : boxed_column {
            label = "Insertion Point";
            fixed_width = true;
            fixed_height = true;
            ddmod_pk_pt_1_button;
            ddmod_x1_box;
            ddmod_y1_box;
            ddmod_z1_box;
        }
        spacer;
        : column {
            fixed_width = true;
            fixed_height = true;
            : text {
               label = "   ";
            }
            : ddmod_num_box {
                label = "X-scale: ";
                mnemonic = "a";
                key = "xscale";
            }
            : ddmod_num_box {
                label = "Y-scale: ";
                mnemonic = "l";
                key = "yscale";
            }
            : ddmod_num_box {
                label = "Z-scale: ";
                mnemonic = "e";
                key = "zscale";
            }
            : ddmod_num_box {
                label = "Rotation: ";
                mnemonic = "R";
                key = "rot";
            }
        }
        spacer;
        : row {
            : column {
                spacer_1;
                : text { label = "Columns: ";     }
                : text { label = "Rows: ";        }
                : text { label = "Col Spacing: "; }
                : text { label = "Row Spacing: "; }
                : text { label = "Attributes: ";  }
            }
            : column {
                spacer_1;
                : text { width = 11; key = "columns"; }
                : text { width = 11; key = "rows";    }
                : text { width = 11; key = "col_sp";  }
                : text { width = 11; key = "row_sp";  }
                : text { width = 11; key = "attribs"; }
            }
        }
    }
    spacer;
    // ACAD_LT has no "Show clipped block" toggle
    ok_cancel_help_errtile;
}

ddmod_hatch : dialog {
    label = "Modify Associative Hatch";
    ddmod_common_fields;
    : row {
      : concatenation {
         : text_part {
             label = "Block Name: ";
             width = 12;
         }
         : text_part {
             key = "Bl_name";
             width = 33;
             fixed_width = true;
         }
      }
      spacer_1;
    }
    spacer;
    : row { 
        alignment = centered;
        fixed_width = true;
        ok_cancel;
        : spacer { width = 2; }
        : button {
            label = "Hatch Edit...";
            mnemonic = "H";
            key = "b_hatch";
        }
        : spacer { width = 2; }
        help_button;
    }
    errtile;
}

ddmod_newhatch : dialog {
    label = "Modify Hatch";
    ddmod_common_fields;
    spacer;
    : row { 
        alignment = centered;
        fixed_width = true;
        ok_cancel;
        : spacer { width = 2; }
        : button {
            label = "Hatch Edit...";
            mnemonic = "H";
            key = "b_hatch";
        }
        : spacer { width = 2; }
        help_button;
    }
    errtile;
}

ddmod_xref : dialog {
    label = "Modify External Reference";
    ddmod_common_fields;
    spacer;
    : row {
        : concatenation {
           : text_part {
               label = "Xref Name: ";
           }
           : text_part {
               key = "Bl_name";
               width = 12;
           }
        }
        spacer_0;
        : concatenation {
           : text_part {
               label = "Path: ";
           }
           : text_part {
               key = "path";
               width = 35;
           }
        }
    }
    spacer;
    : row {
        fixed_width = true;
        : boxed_column {
            label = "Insertion Point";
            fixed_width = true;
            fixed_height = true;
            ddmod_pk_pt_1_button;
            ddmod_x1_box;
            ddmod_y1_box;
            ddmod_z1_box;
        }
        spacer;
        : column {
            fixed_width = true;
            fixed_height = true;
            : text {
               label = "   ";
            }
            : ddmod_num_box {
                label = "X-scale: ";
                mnemonic = "a";
                key = "xscale";
            }
            : ddmod_num_box {
                label = "Y-scale: ";
                mnemonic = "l";
                key = "yscale";
            }
            : ddmod_num_box {
                label = "Z-scale: ";
                mnemonic = "e";
                key = "zscale";
            }
            : ddmod_num_box {
                label = "Rotation: ";
                mnemonic = "R";
                key = "rot";
            }
        }
        spacer;
        : row {
            : column {
                spacer_1;
                : text { label = "Columns: ";     }
                : text { label = "Rows: ";        }
                : text { label = "Col Spacing: "; }
                : text { label = "Row Spacing: "; }
            }
            : column {
                spacer_1;
                : text { width = 11; key = "columns"; }
                : text { width = 11; key = "rows";    }
                : text { width = 11; key = "col_sp";  }
                : text { width = 11; key = "row_sp";  }
            }
        }
    }
    spacer;
    // ACAD_LT has no "Show clipped xref" toggle
    ok_cancel_help_errtile;
}

ddmod_text : dialog {
    label = "Modify Text";
    ddmod_common_fields;
    spacer;
    : edit_box {
        label = "Text: ";
        mnemonic = "e";
        key = "t_string";
        width = 50;
        edit_limit = 253;
    }
    spacer;
    : row {
        fixed_width = true;
        : boxed_column {
            label = "Origin";
            fixed_width = true;
            ddmod_pk_pt_1_button;
            ddmod_x1_box;
            ddmod_y1_box;
            ddmod_z1_box;
        }
        : column {
            fixed_width = true;
            : text {
                label = "  ";
            }
            : ddmod_num_box {
                label = "Height: ";
                mnemonic = "g";
                key = "hght";
            }
            : ddmod_num_box {
                label = "Rotation: ";
                mnemonic = "R";
                key = "rot";
            }
            : ddmod_num_box {
                label = "Width Factor: ";
                mnemonic = "W";
                key = "wid";
            }
            : ddmod_num_box {
                label = "Obliquing: ";
                mnemonic = "O";
                key = "obl";
            }
        }
        : column {
            fixed_width = true;
            : text {
                label = "  ";
            }
            : popup_list {
                label = "Justify:";
                mnemonic = "J";
                key = "popup_just";
                edit_width = 13;
            }
            : popup_list {
                label = "Style:";
                mnemonic = "e";
                key = "style";
                edit_width = 13;
            }
            : column {
                children_fixed_width = true;
                : toggle {
                    label = "Upside Down";
                    mnemonic = "U";
                    key = "upsd";
                }
                : toggle {
                    label = "Backward";
                    mnemonic = "B";
                    key = "bkwd";
                }
            }
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_mtext : dialog {
    label = "Modify MText";
    ddmod_common_fields;
    : row {
        : boxed_column {
            label = "Insertion Point";
            fixed_width = true;
            ddmod_pk_pt_1_button;
            ddmod_x1_box;
            ddmod_y1_box;
            ddmod_z1_box;
        }
        : column {
            : row {
                : edit_box {
                    label = "Contents:";
                    mnemonic = "n";
                    width = 40;
                    edit_limit = 250;
                    key = "t_string";
                }
                : button {
                    label = "Full editor...";
                    mnemonic = "F";
                    key = "MTextEdit";
                }
            }
            : row {
                : column {
                    : popup_list {
                        label = "Style:";
                        mnemonic = "e";
                        edit_width = 20;
                        key = "style";
                    }
                    : popup_list {
                        label = "Justify:";
                        mnemonic = "J";
                        edit_width = 20;
                        key = "MTextJustify";
                    }
                    : popup_list {
                        label = "Direction:";
                        mnemonic = "D";
                        edit_width = 20;
                        key = "MTextDirection";
                    }
                }
                : column {
                    : ddmod_num_box {
                        label = "Width:";
                        mnemonic = "W";
                        key = "wid";
                    }
                    : ddmod_num_box {
                        label = "Text Height:";
                        mnemonic = "H";
                        key = "hght";
                    }
                    : ddmod_num_box {
                        label = "Rotation:";
                        mnemonic = "R";
                        key = "rot";
                    }
                }
            }
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_attdef : dialog {
    label = "Modify Attribute Definition";
    ddmod_common_fields;
    spacer;
    : row {
        children_fixed_width = true;
        : edit_box {
            label = "Tag:";
            mnemonic = "a";
            key = "tag";
            edit_width = 12;
            edit_limit = 253;
        }
        : edit_box {
            label = "Prompt:";
            mnemonic = "r";
            key = "prompt";
            edit_width = 12;
            edit_limit = 253;
        }
        : edit_box {
            label = "Default:";
            mnemonic = "D";
            key = "t_string";
            edit_width = 12;
            edit_limit = 253;
        }
    }
    spacer;
    : row {
        fixed_width = true;
        : boxed_column {
            label = "Origin";
            fixed_width = true;
            ddmod_pk_pt_1_button;
            ddmod_x1_box;
            ddmod_y1_box;
            ddmod_z1_box;
        }
        : column {
            fixed_width = true;
            : text {
                label = "  ";
            }
            : ddmod_num_box {
                label = "Height: ";
                mnemonic = "g";
                key = "hght";
            }
            : ddmod_num_box {
                label = "Rotation: ";
                mnemonic = "R";
                key = "rot";
            }
            : ddmod_num_box {
                label = "Width Factor: ";
                mnemonic = "W";
                key = "wid";
            }
            : ddmod_num_box {
                label = "Obliquing: ";
                mnemonic = "O";
                key = "obl";
            }
        }
        : column {
            fixed_width = true;
            : text {
                label = "  ";
            }
            : row {
                : popup_list {
                    label = "Justify:";
                    mnemonic = "J";
                    key = "popup_just";
                    edit_width = 13;
                }
            }
            : row {
                : popup_list {
                    label = "Style:";
                    mnemonic = "e";
                    key = "style";
                    edit_width = 13;
                }
            }
            : row {
                : column {
                   children_fixed_width = true;
                   : toggle {
                      label = "&Upside Down";
                      key = "upsd";
                   }
                   : toggle {
                       label = "&Backward";
                       key = "bkwd";
                   }
                   : toggle {
                       label = "In&visible";
                       key = "inv";
                   }
                }
                : column {
                   children_fixed_width = true;
                   : toggle {
                       label = "Co&nstant";
                       key = "con";
                   }
                   : toggle {
                       label = "Veri&fy";
                       key = "ver";
                   }
                   : toggle {
                       label = "Prese&t";
                       key = "pre";
                   }
                }
            }
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_pline : dialog {
    label = "Modify Polyline";
    ddmod_common_fields;
    spacer;
    : row {
        fixed_width = true;
        : concatenation {
            : text_part {
                label = "Polyline Type: ";
            }
            : text_part {
                key = "ptype";
                width = 19;
            }
        }
    }
    spacer;
    : row {
        : boxed_column {
            label = "Vertex Listing";
            fixed_width = true;
            : row {
                : column {
                    vertical_margin = wide;
                    : concatenation {
                        : text_part {
                            label = "Vertex:";
                        }
                        : text_part {
                            key = "ctr";
                            width = 4;
                        }
                    }
                }
                : column {
                    : button {
                        label = "Next";
                        mnemonic = "N";
                        key = "next_v";
                    }
                }
            }
            : concatenation {
                : text_part {
                  label = "X: ";
                }
                : text_part {
                  key = "xtext";
                  width = 10;
                }
            }
            : concatenation {
                : text_part {
                  label = "Y: ";
                }
                : text_part {
                  key = "ytext";
                  width = 10;
                }
            }
            : concatenation {
                : text_part {
                  label = "Z: ";
                }
                : text_part {
                  key = "ztext";
                  width = 10;
                }
            }
        }
        spacer;
        : boxed_radio_column {
            label = "Fit/Smooth";
            key = "f-s";
            : radio_button {
                label = "None";
                mnemonic = "o";
                key = "none";
            }
            : radio_button {
                label = "Quadratic";
                mnemonic = "Q";
                key = "quad";
            }
            : radio_button {
                label = "Cubic";
                mnemonic = "b";
                key = "cubic";
            }
            : radio_button {
                label = "Curve Fit";
                mnemonic = "r";
                key = "fit";
            }
        }
        spacer;
        : boxed_column {
            fixed_width = true;
            label = "Polyline";
            key = "pline";
            : column {
               fixed_height = true;
               : toggle {
                   label = "Closed";
                   mnemonic = "d";
                   key = "closed";
               }
               : toggle {
                   label = "LT Gen";
                   mnemonic = "G";
                   key = "ltgen";
               }
            }
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_vport : dialog {
    label = "Modify Viewport";
    ddmod_common_fields;
    : row {
        : boxed_column {
            label = "View Center";
            fixed_width = true;
            : concatenation {
                : text_part {
                  label = "X: ";
                }
                : text_part {
                  key = "xtext";
                  width = 10;
                }
            }
            : concatenation {
                : text_part {
                  label = "Y: ";
                }
                : text_part {
                  key = "ytext";
                  width = 10;
                }
            }
            : concatenation {
                : text_part {
                  label = "Z: ";
                }
                : text_part {
                  key = "ztext";
                  width = 10;
                }
            }
        }
        spacer_0;
        : column {
            fixed_width = true;
            : text {
               label = "   ";
            }
            : concatenation {
                : text_part {
                  label = "Vport ID:";
                  width = 10;
                }
                : text_part {
                  key = "vpid";
                  width = 10;
                }
            }
            : concatenation {
                : text_part {
                  label = "Width:";
                  width = 10;
                }
                : text_part {
                  key = "wid";
                  width = 10;
                }
            }
            : concatenation {
                : text_part {
                  label = "Height:";
                  width = 10;
                }
                : text_part {
                  key = "hght";
                  width = 10;
                }
            }
        }
        spacer_0;
        : column {
            alignment = top;
            fixed_width = true;
            fixed_height = true;
            : text {
               label = "   ";
            }
            : concatenation {
                : text_part {
                  label = "Status: ";
                  width = 8;
                }
                : text_part {
                  key = "on-off";
                  width = 15;
                }
            }
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_dimen : dialog {
    label = "Modify Dimension";
    ddmod_common_fields;
    : row {
        : column {
            fixed_height = true;
            fixed_width = true;
            alignment = top;
            : edit_box {
                label = "Contents:";
                mnemonic = "n";
                key = "t_string";
                edit_width = 25;
                edit_limit = 250;
            }
            spacer;
            : popup_list {
                label = "Style: ";
                mnemonic = "e";
                key = "mod_style";
                edit_width = 25;
                list = "";
            }
        }
        spacer;
        : button {
            alignment = top;
            label = "Full editor...";
            mnemonic = "d";
            key = "mod_text";
        }
        // ACAD_LT has no Geometry / Format / Annotation buttons
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_leader : dialog {
    label = "Modify Leader";
    ddmod_common_fields;
    : row {
        fixed_width = true;
        alignment = centered;
        : column {
            fixed_width = true;
            fixed_height = true;
            // ACAD_LT has no "Edit..." button (it's always disabled anyhow)
            ddmod_dimedit_mod_style;
        }
        : spacer { width = 2; }
        // ACAD_LT has no Geometry / Format / Annotation buttons
        : column {
            : radio_column {
                label = "Type";
                key = "s-s";
                : radio_button {
                    label = "St&raight";
                    key = "straight";
                }
                : radio_button {
                    label = "S&pline";
                    key = "spline";
                }
            }
            : toggle {
                label = "&Arrow";
                height = 2;
                key = "arrow";
                fixed_width = true;
            }
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_tolerance : dialog {
    label = "Modify Tolerance";
    ddmod_common_fields;
    : row {
        fixed_width = true;
        alignment = centered;
        ddmod_dimedit_column;
        // ACAD_LT has no Geometry / Format / Annotation buttons
    }
    spacer;
    ok_cancel_help_errtile;
}

ddmod_other : dialog {
    label = "(replaced by object type)";
    key = "title";
    ddmod_common_fields;
    : row {
        fixed_width = true;
        spacer;
        : column {
            alignment = top;
            fixed_height = true;
            spacer_1;
        }
    }
    ok_cancel_help_errtile;
}

ddmod_setltype : dialog {
    label = "Select Linetype";
    image_block;
    : list_box {
        height = 12;
        key = "list_lt";
        allow_accept = true;
    }
    : edit_box {
        key = "edit_lt";
        allow_accept = false;
        label = "Linetype:";
        mnemonic = "L";
        edit_width = 32;
        edit_limit = 217;
    }
    ok_cancel_err;
}

ddmod_setlayer : dialog {
    subassembly = 0;
    label = "Select Layer";
    initial_focus = "listbox";
    : concatenation {
        children_fixed_width = true;
        key = "clayer";
        : text_part {
            label = "Current Layer: ";
            width = 15;
        }
        : text_part {
            key = "cur_layer";
            width = 35;
        }
    }
    : list_box {
        height = 12;
        key = "list_lay";
        allow_accept = true;
    }
    : row {
        key = "controls";
        : column {
            key = "lname";
            fixed_width = true;
            : edit_box {
                label = "Set Layer Name:";
                mnemonic = "S";
                key = "edit_lay";
                width = 32;
                edit_width = 32;
                edit_limit = 31;
                allow_accept = true;
            }
        }
    }
    ok_cancel_err;
}

//  DDMODIFY stuff precedes.

//  DDSELECT stuff follows.  
//  Taken from ddselect.dcl,v 1.11 1995/08/03 10:25:54 edc

ddselect : dialog {
    label = "Object Selection Settings";
    : boxed_column {
        label = "Selection Modes";
        : toggle {
            label = "Noun/Verb Selection";
            key = "pickfirst";
            mnemonic = "N";
            fixed_width = true;
        }
        : toggle {
            label = "Use Shift to Add";
            key = "pickadd";
            mnemonic = "U";
            fixed_width = true;
        }
        : toggle {
            label = "Press and Drag";
            key = "pickdrag";
            mnemonic = "P";
            fixed_width = true;
        }
        : toggle {
            label = "Implied Windowing";
            key = "pickauto";
            mnemonic = "I";
            fixed_width = true;
        }
      : toggle {
          label = "Object Grouping";
          key = "grouping";
          mnemonic = "G";
          fixed_width = true;
      }
      : toggle {
          label = "Associative Hatch";
          key = "hatch";
          mnemonic = "A";
          fixed_width = true;
      }
        : button {
            label = "Default";
            key = "default_mode";
            fixed_width = true;
            mnemonic = "D";
            alignment = centered;
        }
    }
    : boxed_row {
        label = "Pickbox Size";
        mnemonic = "S";
        spacer_0;
        : column {
            spacer_0;
            fixed_width = true;
            : text {
                  label = "Min         Max";
                  alignment = centered;
            }
            : slider {
                key = "pickbox_slider";
                min_value = 0;
                max_value = 19;
                width = 20;
                height = 1;
                small_increment = 1;
                big_increment = 1;
                fixed_width = true;
                fixed_height = true;
            }
            spacer_0;
        }
        : image {
            key = "pickbox_image";
            aspect_ratio = 1;
            height = 4;
            width = 7;
            color = -2;
        }
        spacer_0;
    }
    : button {
        label = "Object Sort Method...";
        key = "ent_sort";
        mnemonic = "E";
        fixed_width = true;
        alignment = centered;
    }
    ok_cancel_help;
}

sortents : dialog {
    label = "Object Sort Method";
    : text {
        label = "Sort Objects for";
    }
    : toggle {
        label = "Object Selection";
        key = "sort_obj_sel";
        mnemonic = "O";
        fixed_width = true;
    }
    : toggle {
        label = "Object Snap";
        key = "sort_obj_snap";
        mnemonic = "S";
        fixed_width = true;
    }
    : toggle {
        label = "Redraws";
        key = "sort_redraws";
        mnemonic = "R";
        fixed_width = true;
    }
    : toggle {
        label = "Regens";
        key = "sort_regens";
        mnemonic = "e";
        fixed_width = true;
    }
    : toggle {
        label = "Plotting";
        key = "sort_plot";
        mnemonic = "P";
        fixed_width = true;
    }
    : toggle {
        label = "PostScript Output";
        key = "sort_post";
        mnemonic = "c";
        fixed_width = true;
    }
    ok_cancel;
}

//  DDSELECT stuff precedes.

//  Continues in ACLT3.DCL

// Next available MSG number is   1
// MODULE_ID ACLT3_DCL_

//     ACLT.DCL      Version 13.0 for AutoCAD LT 3.0
//     Third of 4 parts
//
//     Copyright (C) 1993, 1994, 1995 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.
// AutoCAD DCL (Dialog Control Language)
// Define AutoCAD dialogs

// This file should not be modified when used with AutoCAD.
// Modification to the dialogue definitions can have serious adverse
// effects on the use of the product.  Since no modifications to this
// file are allowed, there should be no need for any internal error
// checking on the contents of this file, hence we disable audit checks
// by default.

ddattext : dialog {
    label = "Attribute Extraction";
    : boxed_radio_column {
        label = "File Format";
        : radio_button {
            label = "Comma Delimited File (CDF)";
            key = "cdf";
            mnemonic = "C";
           }
           : radio_button {
            label = "Space Delimited File (SDF)";
            key = "sdf";
            mnemonic = "S";
        }
           : radio_button {
            label = "Drawing Interchange File (DXF)";
            key = "dxf";
            mnemonic = "D";
        }
    }
	: row {
		:column {
	        : button {
    	        label = "Select Objects <";
        	    mnemonic = "O";
            	key = "selobjs";
    	    }
	        : button {
        	    label = "Attribute Template File... ";
    	        key = "select_temp_file";
	            mnemonic = "T";
	        }
	        : button {
    	        label = "Output File... ";
        	    key = "select_out_file";
            	mnemonic = "F";
	        }
		}
		:column {
        	: concatenation {
            	: text_part {
        	        label = "Number found: ";
    	        }
	            : text_part {
            	    key = "how_many";
        	        width = 5;
    	        }
	        }
	        : edit_box {
            	edit_width = 20;
        	    key = "temp_file";
            	fixed_width = true;
	        	edit_limit = 259;
    	    }
	        : edit_box {
    	        edit_width = 20;
        	    key = "out_file";
            	fixed_width = true;
	        	edit_limit = 259;
    	    }
		}
	}


    ok_cancel_help_errtile;
}

out_exists : dialog {
    label = "Warning";
    : paragraph {
        : text_part {
            label = "The output file already exists.";
        }
        : text_part {
            label = "Do you want to replace it?";
        }
    }
    spacer_1;
    : row {
        fixed_width = true;
        alignment = centered;
        : button {
            label = "Yes";
            mnemonic = "R";
            key = "yes";
            width = 8;
        }
        : spacer {
            width = 2;
        }
        : default_button {
            label = "No";
            mnemonic = "C";
            key = "no";
            width = 8;
        }
    }
}

out_temp : dialog {
    label = "Warning";
    : paragraph {
        : text_part {
            label = "The template file and output file have the same name.";
        }
        : text_part {
            label = "Please change the output file name.";
        }
    }
    spacer_1;
    : ok_button {
        is_cancel = true;
    }

}
//  Continues in ACLT4.DCL

// Next available MSG number is   1
// MODULE_ID ACLT4_DCL_

//     ACLT.DCL      Version 13.0 for AutoCAD LT 3.0
//     Fourth of 4 parts
//
//     Copyright (C) 1993, 1994, 1995 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.
// AutoCAD DCL (Dialog Control Language)
// Define AutoCAD dialogs

// This file should not be modified when used with AutoCAD.
// Modification to the dialogue definitions can have serious adverse
// effects on the use of the product.  Since no modifications to this
// file are allowed, there should be no need for any internal error
// checking on the contents of this file, hence we disable audit checks
// by default.

//  CalComp ADI 4.2 AutoCAD Driver
//  Release 6.4.6  7 Nov 1996
//  (C) CalComp, Inc.
//  David Maeschen 
//
//  All labels, lists, and mnemonics should be internationalized
//  Keys and values should not be 
//  (lisp file references them and config file will remain American)

//  Main Menu of the Graphical User Interface
//  MAINMENU.DCL
//  11/07/96  Added Connection CDCLBegin, CDCLEnd, and 
//            Pens Dither Areas and Dithering 
//  09/09/96  Put media image in two columns 
//  06/18/96  Removed accept_return from images
//            Added Connection Timeout ConnTimeout 
//  05/14/96  Added Media Full Page Area MediaFPage 
//  03/29/96  Decimal Connection parameters.  Stretched Cconfig dialog.
//  12/15/95  Allow_accept on edits and images only

mainmenu : dialog {
    label = "CalComp Plotter Configuration";
    initial_focus = "accept";
    fixed_width = true;
    : row {
	alignment = centered;
	: button {
	    label = "Anno...";
	    mnemonic = "A";
	    key = "anno";
	}
	: button {
	    label = "Conn...";
	    mnemonic = "o";
	    key = "conn";
	}
	: button {
	    label = "Pens...";
	    mnemonic = "P";
	    key = "pens";
	}
	: button {
	    label = "Media...";
	    mnemonic = "M";
	    key = "media";
	}
    }
    : row {
	: column {
	    : text_part {
		label = "Model:";
		key = "modellabel";
	    }
	    : popup_list {
		key = "ccmodels";
		list = "";
		fixed_width = true;
		edit_width = 32;
	    }
	}
	: column {
	    : text_part {
		label = "Configuration:";
		key = "cfglabel";
	    }
	    : popup_list {
		key = "ccconfigs";
		list = "";
		fixed_width = true;
		edit_width = 32;
	    }
	}
    }
    : row {
	alignment = centered;
	: button {
	    label = "New...";
	    mnemonic = "w";
	    key = "new";
	}
	: button {
	    label = "Delete";
	    mnemonic = "l";
	    key = "delete";
	}
    }
    : row {
	//fixed_width = true;
	spacer_0;
	: column {  
	    // Begin Left Column
	    :image_button {
		key = "cclogo";
		color = dialog_background;
		height = 5;
		aspect_ratio = 3;
	    }
	    : toggle {
		label = "Use Plotter Values";
		mnemonic = "V";
		key = "PlotterValues";
	    }
	}  // End Left Column
	spacer_0;
	spacer_0;
	spacer_0;
	spacer_0;
	: column {
	    alignment = right;
	    : popup_list {
		label = "Source:";
		mnemonic = "S";
		key = "Sources";
		list = "Cut sheet\nCut Sheet\nRoll & Cut\nRoll & Cut\n";
		value = "1";
		edit_width = 12;
	    }
	    : popup_list {
		label = "Mode:";
		mnemonic = "d";
		key = "Modes";
		list = "Draft\nNormal\nEnhanced\nGraphics\nGraphics Fast\nHi-Res Mono\nInk-Saver";
		value = "1";
		edit_width = 12;
	    }
	    : popup_list {
		label = "Colors: ";
		mnemonic = "C";
		key = "Colors";
		list = "Color\nGreyscale\nBlack";
		value = "0";
		edit_width = 12;
	    }
	    : edit_box {
		label = "Number of Copies:";
		mnemonic = "N";
		key = "Copies";
		value = "1";
		fixed_width = true;
		edit_width = 2;
		edit_limit = 2;
	    }
	}  // End Right Column
	spacer_0;
    }  // End Row of two columns
    : boxed_column {
	label = "Current Annotation:";
	: text {
	    width = 50;
	    key = "comment";
	}
    }
    : row {
	fixed_width = true;
	alignment = centered;
	: retirement_button {
	    label = "OK";
	    key = "accept";
	    width = 12;
	    is_default = true;
	}
	: retirement_button {
	    label = "Cancel";
	    key = "cancel";
	    width = 12;
	    is_cancel = true;
	}
	: button {
	    label = "Help...";
	    mnemonic = "H";
	    key = "help";
	    width = 12;
	}
	: button {
	    label = "About...";
	    key = "about";
	    width = 12;
	}
    }
}  // End MAIN MENU Dialog //

nomenu : dialog {
    label = "No CalComp Plotters Found!";
    initial_focus = "accept";
    fixed_width = true;
    : paragraph {
	children_alignment = centered;
	: text_part {
	    label = "Use the AutoCAD LT command 'config' ";
	}
	: text_part {
	    label = "to install a CalComp plotter.  ";
	}
    }
    fixed_width = true;
    alignment = centered;
    : retirement_button {
	label = "OK";
	key = "accept";
	width = 12;
	is_default = true;
    }
}

nomodels : dialog {
    label = "No CalComp Plotters Left!";
    initial_focus = "accept";
    fixed_width = true;
    : paragraph {
	children_alignment = centered;
	: text_part {
	    label = "OK or Cancel all changes?";
	}
    }
    fixed_width = true;
    alignment = centered;
    : row {
	: retirement_button {
	    label = "OK";
	    key = "accept";
	    width = 12;
	    is_default = true;
	}
	: retirement_button {
	    label = "Cancel";
	    key = "cancel";
	    width = 12;
	    is_cancel = true;
	}
    }
}
//   About Box
//   ABOUT.DCL
	
about: dialog {
    label = "About";
    initial_focus = "accept";
    : paragraph {
	children_alignment = centered;
	: text_part {
	    label = "CalComp AutoCAD LT Driver";
	}
	: text_part {
	    label = "Version 6.4.6";
	}
	: text_part {
	    label = "Copyright (C) 1995,1996 CalComp Inc.";
	}
	: image_button {
	    key = "cclogo";
	    color = dialog_background;
	    height = 5;
	    aspect_ratio = 3;
	}
    }
    fixed_width = true;
    alignment = centered;
    : retirement_button {
	label = "OK";
	key = "accept";
	width = 12;
	is_default = true;
    }
}

//   New Box
//   NEW.DCL

new: dialog {
    label = "New Configuration";
    initial_focus = "newcf";
    : edit_box { 
	key = "newcf";
	width = 15;
	edit_limit = 32;
	allow_accept = true;    
    }
    : row {
	fixed_width = true;
	alignment = centered;
	: retirement_button {
	    label = "OK";
	    key = "accept";
	    width = 12;
	    is_default = true;
	}
	: retirement_button {
	    label = "Cancel";
	    key = "cancel";
	    width = 12;
	    is_cancel = true;
	}
    }
}

//   Delete Box
//   DELETE.DCL

delete: dialog {
    label = "Delete Configuration";
    initial_focus = "accept";
    : paragraph {
	: text_part {
	    label = "Are you sure you want ";
	}
	: text_part {
	    label = "to delete this configuration?";
	}
    }
    : row {
	fixed_width = true;
	alignment = centered;
	: retirement_button {
	    label = "OK";
	    key = "accept";
	    width = 12;
	    is_default = true;
	}
	: retirement_button {
	    label = "Cancel";
	    key = "cancel";
	    width = 12;
	    is_cancel = true;
	}
    }
}

//  Annotation Dialog
//  ANNO.DCL

anno: dialog {
    label = "Annotation";
    initial_focus = "accept";
    : row  { 
	: column {
	    : toggle {
		label = "Filename";
		mnemonic = "F";
		key = "AnnoFile";
	    }
	    : toggle {
		label = "Date/Time";
		mnemonic = "T";
		key = "AnnoTime";
	    }
	}  
	: column {
	    : toggle {
		label = "Driver Info";
		mnemonic = "I";
		key = "AnnoDrvr";
	    }
	    : toggle {
		label = "Crop Marks";
		mnemonic = "M";
		key = "AnnoCrop";
	    }
	}  
    } 

    : column {
	: text {
	    key = "commentlabel";
	    label = "Comments: (60 Characters Max)";
	    mnemonic = "C";
	}
	: edit_box {
	    key = "AnnoComm";
	    width = 32;
	    edit_limit = 60;
	    allow_accept = true;
	}
    }  // End Comment column

    : row {
	fixed_width = true;
	alignment = centered;
	: retirement_button {
	    label = "OK";
	    key = "accept";
	    width = 12;
	    is_default = true;
	}
	: retirement_button {
	    label = "Cancel";
	    key = "cancel";
	    width = 12;
	    is_cancel = true;
	}
	: button {
	    label = "Help...";
	    mnemonic = "H";
	    key = "help";
	    width = 12;
	}
    }
}  // End PLOT ANNOTATE Dialog //

//   Connection Dialog (NON CDCL PLOTTERS)
//   CONN.DCL

conn: dialog {
    label = "Connection";
    initial_focus = "accept";
    : column { 
	: row {
	    spacer_0;
	    : popup_list {
		fixed_width = true;
		label = "Number of SYNC Codes:";
		mnemonic = "N";
		key = "ConnNsync";
		list = "0\n1\n2";
		value = "2";
		edit_width = 3;
	    }
	}
	: row {
	    : column {
		: toggle {
		    label = "PAD";
		    mnemonic = "P";
		    key = "ConnPad";
		}
		: toggle {
		    label = "CHECKSUM";
		    mnemonic = "C";
		    key = "ConnChksum";
		    value = "1";
		}
	    }
	    : column {
		: edit_box {
		    label = "SYNC Code";
		    mnemonic = "S";
		    key = "ConnSync";
		    value = "22";
		    width = 2;
		    edit_limit = 3;
		    edit_width = 2;
		}
		: edit_box {
		    label = "EOB/EOM Code";
		    mnemonic = "E";
		    key = "ConnEobm";
		    value = "13";
		    width = 2;
		    edit_limit = 3;
		    edit_width = 2;
		}
	    }
	}
//    Uncomment for Connection Timeout control
	: row {
	    spacer_0;
	    : edit_box {
		fixed_width = true;
		label = "Timeout (s)";
		mnemonic = "T";
		key = "ConnTimeout";
		value = "60";
		width = 2;
		edit_limit = 3;
		edit_width = 2;
	    }
	}
	// Uncomment for CDCL Control
	    : edit_box {
		fixed_width = true;
		label = "CDCLBegin:";
		mnemonic = "T";
		key = "CDCLUser";
		value = "";
		width = 24;
		edit_limit = 60;
		edit_width = 24;
	    }
	    : edit_box {
		fixed_width = true;
		label = "CDCLEnd:   ";
		mnemonic = "T";
		key = "CDCLUserEnd";
		value = "";
		width = 24;
		edit_limit = 60;
		edit_width = 24;
	    }

    }

    : row {
	fixed_width = true;
	alignment = centered;
	: retirement_button {
	    label = "OK";
	    key = "accept";
	    width = 12;
	    is_default = true;
	}
	: retirement_button {
	    label = "Cancel";
	    key = "cancel";
	    width = 12;
	    is_cancel = true;
	}
	: button {
	    label = "Help...";
	    mnemonic = "H";
	    key = "help";
	    width = 12;
	}
    }
}  // End CONN Dialog //

//  Pens Dialog
//  PENS.DCL

pens: dialog {
    label = "Pens";
    initial_focus = "accept";
    fixed_height = true;
    : row {  // Pen
	: column {
	    // Uncomment for intensity control
	    : row {
		: popup_list {
		    label = "Color Palette:";
		    mnemonic = "C";
		    key = "PensPalette";
		    list = "CCOLR.CCP\nCGREY.CCP\n";
		    fixed_width = true;
		    edit_width = 12;
		}
		spacer_0;
	      : edit_box {
		  fixed_width = true;
		  label = "Intensity:";
		  mnemonic = "I";
		  key = "PensIntensity";
		  value = "100";
		  width = 2;
		  edit_limit = 3;
		  edit_width = 2;
		}
	    }
	    spacer_1;
	    : row {
		: toggle {
		    label = "Define Pens";
		    mnemonic = "P";
		    key = "PensDefine";
		    value = "1";
		}
		: toggle {
		    label = "Dither Lines";
		    mnemonic = "L";
		    key = "PensDither";
		    value = "1";
		}
		// Uncomment for area dithering
		: toggle {
		    label = "Dither Areas";
		    mnemonic = "A";
		    key = "PensDAreas";
		    value = "1";
		}
	    }
	    // Uncomment for dithering control
	    : radio_row {
		label = "Dithering";
		: radio_button {
		    label = "Standard";
		    key = "Standard";
		    value = "1";
		}
		key = "PensDType";
		: radio_button {
		    label = "Cluster";
		    key = "Cluster";
		    value = "1";
		}
		: radio_button {
		    label = "Pattern";
		    key = "Pattern";
		}
		: radio_button {
		    label = "Stochastic";
		    key = "Stochastic";
		}
	    }     
	    spacer_1;
	}
    }
    : row {
	: boxed_row {
	    label = "Merge/Over:";
	    key = "mergelabel";
	    mnemonic = "O";
	    fixed_width = true;
	    fixed_height = true;
	    : image_button {
		key = "merge1";
		width = 5;
		aspect_ratio = 0.95;
	    }
	    : image_button {
		key = "merge2";
		width = 5;
		aspect_ratio = 0.95;
	    }
	}
	: boxed_radio_row {
	    label = "Line End/Join:";
	    mnemonic = "E";
	    key = "endlabel";
	    fixed_width = true;
	    fixed_height = true;
	    : image_button {
		key = "lend1";
		width = 5;
		aspect_ratio = 0.95;
	    }
	    : image_button {
		key = "lend2";
		width = 5;
		aspect_ratio = 0.95;
	    }
	    : image_button {
		key = "lend3";
		width = 5;
		aspect_ratio = 0.95;
	    }
	    : image_button {
		key = "lend4";
		width = 5;
		aspect_ratio = 0.95;
	    }
	}  // End Row (Line ends/joins)
    }
    : row {
	fixed_width = true;
	alignment = centered;
	: retirement_button {
	    label = "OK";
	    key = "accept";
	    width = 12;
	    is_default = true;
	}
	: retirement_button {
	    label = "Cancel";
	    key = "cancel";
	    width = 12;
	    is_cancel = true;
	}
	: button {
	    label = "Help...";
	    mnemonic = "H";
	    key = "help";
	    width = 12;
	}
    }

}  // End LINE ATTRIBUTES Dialog //


//   Media Dialog
//   MEDIA.DCL

media : dialog {
    label = "Media";
    initial_focus = "accept";
    : boxed_row {
	label = "Select Image and Media Orientation";
	spacer_0;
	// Limit height to 3.2 for one column 5.4 for two columns
	: column {
	    fixed_width = true;
	    fixed_height = true;
	    : image_button {
		key = "image1";
		height = 5.4;
		aspect_ratio = 1.3;
	    }
	    : image_button {
		key = "image2";
		height = 5.4;
		aspect_ratio = 1.3;
	    }
	// Two columns
	}
	: column {
	    : image_button {
		key = "image3";
		height = 5.4;
		aspect_ratio = 1.3;
	    }
	    : image_button {
		key = "image4";
		height = 5.4;
		aspect_ratio = 1.3;
	    }
	}
	spacer_0;
	: column {
	    fixed_width = true;
	    fixed_height = true;
	    : image_button {
		key = "image5";
		height = 5.4;
		aspect_ratio = 1.3;
	    }
	    : image_button {
		key = "image6";
		height = 5.4;
		aspect_ratio = 1.3;
	    }
	// Two columns
	}
	: column {
	    : image_button {
		key = "image7";
		height = 5.4;
		aspect_ratio = 1.3;
	    }
	    : image_button {
		key = "image8";
		height = 5.4;
		aspect_ratio = 1.3;
	    }
	}
	spacer_0;
    }
    : row {
	: toggle {
	    label = "Mirror x";
	    key = "MediaMirrx";
	}
	: toggle {
	    label = "Mirror y";
	    key = "MediaMirry";
	}
      // Uncomment for Full Page Area control
      : toggle {
	  label = "Full Page Area";
	  mnemonic = "F";
	  key = "MediaFPage";
      }
    }
    : radio_row {
	label = "Long Plot Scale";
	key = "MediaLplot";
	value = "1";
	: radio_button {
	    label = "1";
	    key = "1";
	}
	: radio_button {
	    label = "2";
	    key = "2";
	}
	: radio_button {
	    label = "4";
	    key = "3";
	}
	: radio_button {
	    label = "8";
	    key = "4";
	}
    }     
    : row {
	fixed_width = true;
	alignment = centered;
	: retirement_button {   
	    label = "OK";
	    key = "accept";
	    width = 12;
	    is_default = true;
	}
	: retirement_button {
	    label = "Cancel";
	    key = "cancel";
	    width = 12;
	    is_cancel = true;
	}
	: button {
	    label = "Help...";
	    mnemonic = "H";
	    key = "help";
	    width = 12;
	}
    }  // End Row;
}

//-------------------------------------------------------------------------
//
//  HPMAINMENU1213:  HPCONFIG's main dialog box for AutoCAD R12 / R13
//
//-------------------------------------------------------------------------
hpmainmenu1213: dialog {
    label = "HP Plotter Configuration";
    alignment = centered;
    initial_focus = "accept";
    : boxed_row {
        key=  "modellabel";
        label = "Current device configuration:";
        mnemonic = "u";
        : popup_list {
            fixed_width = true;
            key = "idmodel";
            edit_width = 60;
            tabs = "35";
        }
        : button {
            label = "Hints...";
            key = "DevHints";
            mnemonic = "i";
            fixed_width = true;
        }
    }
    spacer_1;
    : boxed_column {
        label = "Plot configuration:";
        key =  "UserCfg";
        : row {
            : text {
                label = "Configuration File:";
                key = "cfglabel";
                mnemonic = "o";
            }
            : popup_list {
                fixed_width = true;
                key = "cfgfile";
                edit_width = 44;
            }
        }
        : row {
            : column {
                : boxed_radio_column {
                    label = "Quality";
                    key   = "qual";
                    : radio_button {
                        label = "Fast \/ Draft";
                        key = "Quality1";
                        mnemonic = "F";
                    }
                    : radio_button {
                        label = "Normal \/ Final";
                        key = "Quality2";
                        mnemonic = "r";
                        value = "1";
                    }
                    : radio_button {
                        label = "Best \/ Enhanced";
                        key = "Quality3";
                        mnemonic = "E";
                    }
                    : radio_button {
                        label = "Plotter Default";
                        key = "Quality4";
                        mnemonic = "D";
                    }
                }
            }
            : column {
                : edit_box {
                    label = "Number of Copies:";
                    mnemonic = "N";
                    key = "copies";
                    edit_width = 2;
                    edit_limit = 2;
                    fixed_width=true;
                }
                : boxed_radio_column {
                    label = "Print colors";
                    key   = "color_set";
                    : radio_button {
                        label = "In color";
                        key = "pcolor";
                        mnemonic = "c";
                    }
                    : radio_button {
                        label = "Colors as gray";
                        key = "pgray";
                        mnemonic = "g";
                    }
                    : radio_button {
                        label = "All as black";
                        key = "pblack";
                        mnemonic = "b";
                    }
                }
            }
            : column {
                : button {
                    label = "Pens...";
                    mnemonic = "P";
                    key = "penattr";
                }
                : button {
                    label = "Annotations...";
                    mnemonic = "A";
                    key = "annotate";
                }
                : button {
                    label = "Media Orientation...";
                    mnemonic = "M";
                    key = "paper";
                }
                : button {
                    label = "Advanced Media Opt...";
                    mnemonic = "v";
                    key = "advopt";
                }
            }
        }
    }
    spacer_1;
    : row {
        fixed_width = true;
        alignment = centered;
        : button {
            label = "OK";
            key = "accept";
            width = 12;
            is_default = true;
        }
        : retirement_button {
            label = "Cancel";
            key = "cancel";
            width = 12;
            is_cancel = true;
        }
        : button {
            label = "Save as...";
            key = "saveas";
            mnemonic = "S";
            width = 12;
        }
        : button {
            label = "Help...";
            key = "helpmain";
            mnemonic = "H";
            width = 12;
        }
        : spacer {
            width = 2;
        }
        : button {
            label = "About...";
            key = "about";
            mnemonic = "t";
            width = 12;
        }
    }
}

//-------------------------------------------------------------------------
//
//  HPMAINMENU14:  HPCONFIG's main dialog box for AutoCAD R14
//
//-------------------------------------------------------------------------
hpmainmenu14: dialog {
    label = "HP Plotter Configuration";
    alignment = centered;
    initial_focus = "accept";
    : boxed_row {
        key=  "modellabel";
        label = "Current device configuration:";
        :text {
            key=  "idmodel";
        }
        : button {
            label = "Hints...";
            key = "DevHints";
            mnemonic = "i";
            fixed_width = true;
        }
    }
    : boxed_column {
        label = "Memory configuration:";
        key =  "MemCfg";
        : row {
            : toggle {
                label = "Optimize memory usage";
                key = "OptimizeMem";
                mnemonic = "u";
            }
            : concatenation {
                : edit_box {
                    label = "Plotter memory:";
                    key = "PlotMem";
                    mnemonic = "m";
                    alignment = right;
                    edit_width = 3;
                    edit_limit = 3;
                }
                : text_part {
                    label = "Mb";
                    key = "PlotMemUnits";
                }
            }
            : button {
                label = "Hints...";
                key = "MemHints";
                mnemonic = "i";
                fixed_width = true;
            }
        }
    }
    : boxed_column {
        label = "Plot configuration:";
        key =  "UserCfg";
        : row {
            : column {
                : boxed_radio_column {
                    label = "Quality";
                    key   = "qual";
                    : radio_button {
                        label = "Fast \/ Draft";
                        key = "Quality1";
                        mnemonic = "F";
                    }
                    : radio_button {
                        label = "Normal \/ Final";
                        key = "Quality2";
                        mnemonic = "r";
                        value = "1";
                    }
                    : radio_button {
                        label = "Best \/ Enhanced";
                        key = "Quality3";
                        mnemonic = "E";
                    }
                    : radio_button {
                        label = "Plotter Default";
                        key = "Quality4";
                        mnemonic = "D";
                    }
                }
            }
            : column {
                : edit_box {
                    label = "Number of Copies:";
                    mnemonic = "N";
                    key = "copies";
                    edit_width = 2;
                    edit_limit = 2;
                    fixed_width=true;
                }
                : boxed_radio_column {
                    label = "Print colors";
                    key   = "color_set";
                    : radio_button {
                        label = "In color";
                        key = "pcolor";
                        mnemonic = "c";
                    }
                    : radio_button {
                        label = "Colors as gray";
                        key = "pgray";
                        mnemonic = "g";
                    }
                    : radio_button {
                        label = "All as black";
                        key = "pblack";
                        mnemonic = "b";
                    }
                }
            }
            : column {
                : button {
                    label = "Pens...";
                    mnemonic = "P";
                    key = "penattr";
                }
                : button {
                    label = "Annotations...";
                    mnemonic = "A";
                    key = "annotate";
                }
                : button {
                    label = "Media Orientation...";
                    mnemonic = "O";
                    key = "paper";
                }
                : button {
                    label = "Advanced Media Opt...";
                    mnemonic = "v";
                    key = "advopt";
                }
            }
        }
    }
    : row {
        fixed_width = true;
        alignment = centered;
        : button {
            label = "OK";
            key = "accept";
            width = 12;
            is_default = true;
        }
        : retirement_button {
            label = "Cancel";
            key = "cancel";
            width = 12;
            is_cancel = true;
        }
        : button {
            label = "Help...";
            key = "helpmain";
            mnemonic = "H";
            width = 12;
        }
        : spacer {
            width = 2;
        }
        : button {
            label = "About...";
            key = "about";
            mnemonic = "t";
            width = 12;
        }
    }
}

//-------------------------------------------------------------------------
//
//  PENATTR:  Dialog box to set pen attributes (except pen plotters)
//
//-------------------------------------------------------------------------
penattr: dialog {
    label = "Pens";
    initial_focus = "accept";
    fixed_height = true;
    : row {
        : column {
            : popup_list {
                label = "Pen (1..255):";
                mnemonic = "P";
                fixed_width = true;
                key = "slider";
                edit_width = 4;
            }
            : button {
                label = "Apply to All Pens";
                mnemonic = "A";
                key = "okall";
            }
        }
        : column {
            : boxed_row {
                label = "Plot Merge Control";
                : radio_column {
                    key = "mc";
                    fixed_height = true;
                    : radio_button {
                        label = "Lines Overwrite";
                        key = "mc0";
                        mnemonic = "O";
                    }
                    : radio_button {
                        label = "Lines Merge";
                        key = "mc1";
                        mnemonic = "M";
                    }
                }
                : column {
                    fixed_width = true;
                    :image {
                        key = "overw_im";
                        height = 1;
                        aspect_ratio = 1.4;
                    }
                    :image {
                        key = "merge_im";
                        height = 1;
                        aspect_ratio = 1.4;
                    }
                }
                spacer_1;
            }
            : button {
                label = "Halftoning...";
                key = "printop";
                mnemonic = "t";
            }
        }
    }
    : row {
        :boxed_row {
            label = "Line End:";
            key = "endlabel";
            mnemonic = "E";
            : image_button {
                key = "end_tile1";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "end_tile2";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "end_tile3";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "end_tile4";
                width = 5;
                aspect_ratio = 0.75;
            }
        }
        :boxed_row {
            label = "Line Join:";
            key = "joinlabel";
            mnemonic = "J";
            : image_button {
                key = "join_tile1";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "join_tile2";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "join_tile3";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "join_tile4";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "join_tile5";
                width = 5;
                aspect_ratio = 0.75;
            }
        }
    }
    : row {
        : boxed_column {
            label = "Fill:";
            mnemonic = "F";
            : list_box {
                fixed_height = true;
                height = 5;
                key = "filltype";
            }
            : edit_box {
                fixed_width = true;
                edit_width = 2;
                edit_limit = 2;
                label = "Spacing 1..99mm:";
                key   = "spacing";
                mnemonic = "S";
            }
            : edit_box {
                fixed_width = true;
                edit_width = 3;
                edit_limit = 3;
                label = "Angle 0..359:";
                key   = "angle";
                mnemonic = "g";
            }
            : edit_box {
                fixed_width = true;
                edit_width = 2;
                edit_limit = 2;
                label = "Shade 0..99%:";
                key   = "shdpct";
                mnemonic = "d";
            }
        }
        : boxed_column {
            label = "Raster Patterns:";
            key = "rastpat";
            mnemonic = "R";
            fixed_height = true;
            width = 33;
            : list_box {
                fixed_height = true;
                height = 8;
                key = "patlist";
            }
            : button {
                label = "Change...";
                mnemonic = "C";
                key = "changerast";
            }
        }
    }
    : row {
        fixed_width = true;
        alignment = centered;
        : retirement_button {
            label = "OK";
            key = "accept";
            width = 12;
            is_default = true;
        }
        : retirement_button {
            label = "Cancel";
            key = "cancel";
            width = 12;
            is_cancel = true;
        }
        : button {
            label = "Help...";
            key = "helppen";
            width = 12;
            mnemonic = "H";
        }
    }
}

//-------------------------------------------------------------------------
//
//  PENPENATTR:  Dialog box to set pen attributes (pen plotters)
//
//-------------------------------------------------------------------------
penppenattr: dialog {
    label = "Pens";
    initial_focus = "accept";
    fixed_height = true;
    : row {
        : column {
            : popup_list {
                label = "Pen (1..255):";
                mnemonic = "P";
                fixed_width = true;
                key = "slider";
                edit_width = 4;
            }
            : button {
                label = "Apply to All Pens";
                mnemonic = "A";
                key = "okall";
            }
        }
        : column {
            : boxed_row {
                label = "Generate Area Fills in:";
                : radio_column {
                    key = "sfills";
                    fixed_height = true;
                    : radio_button {
                        label = "Plotter (Best Lockout Time)";
                        key = "sfillspl";
                        mnemonic = "l";
                    }
                    : radio_button {
                        label = "AutoCAD (Best Plotting Time)";
                        key = "sfillsacad";
                        mnemonic = "D";
                    }
                }
            }
        }
    }
    : row {
        :boxed_row {
            label = "Line End:";
            key = "endlabel";
            mnemonic = "E";
            : image_button {
                key = "end_tile1";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "end_tile2";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "end_tile3";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "end_tile4";
                width = 5;
                aspect_ratio = 0.75;
            }
        }
        :boxed_row {
            label = "Line Join:";
            key = "joinlabel";
            mnemonic = "J";
            : image_button {
                key = "join_tile1";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "join_tile2";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "join_tile3";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "join_tile4";
                width = 5;
                aspect_ratio = 0.75;
            }
            : image_button {
                key = "join_tile5";
                width = 5;
                aspect_ratio = 0.75;
            }
        }
    }
    : row {
        key = "fillsdef";
        : boxed_column {
            label = "Fill:";
            mnemonic = "F";
            : list_box {
                fixed_height = true;
                height = 5;
                key = "filltype";
            }
            : edit_box {
                fixed_width = true;
                edit_width = 2;
                edit_limit = 2;
                label = "Spacing 1..99mm:";
                key   = "spacing";
                mnemonic = "S";
            }
            : edit_box {
                fixed_width = true;
                edit_width = 3;
                edit_limit = 3;
                label = "Angle 0..359:";
                key   = "angle";
                mnemonic = "g";
            }
            : edit_box {
                fixed_width = true;
                edit_width = 2;
                edit_limit = 2;
                label = "Shade 0..99%:";
                key   = "shdpct";
                mnemonic = "h";
            }
        }
        : boxed_column {
            label = "Raster Patterns:";
            key = "rastpat";
            mnemonic = "R";
            fixed_height = true;
            width = 33;
            : list_box {
                fixed_height = true;
                height = 8;
                key = "patlist";
            }
            : button {
                label = "Change...";
                mnemonic = "C";
                key = "changerast";
            }
        }
    }
    : row {
        fixed_width = true;
        alignment = centered;
        : retirement_button {
            label = "OK";
            key = "accept";
            width = 12;
            is_default = true;
        }
        : retirement_button {
            label = "Cancel";
            key = "cancel";
            width = 12;
            is_cancel = true;
        }
        : button {
            label = "Help...";
            key = "helppen";
            width = 12;
            mnemonic = "H";
        }
    }
}

//-------------------------------------------------------------------------
//
//  ANNOTATE:  Dialog box for annotations
//
//-------------------------------------------------------------------------
annotate: dialog {
    label = "Annotations";
    initial_focus = "accept";
    : row  {
        : column {
            : toggle {
                label = "Drawing Filename";
                key = "dwgname";
                mnemonic = "F";
            }
            : toggle {
                label = "Plot Date/Time";
                key = "plottime";
                mnemonic = "T";
            }
        }
        : column {
            : toggle {
                label = "Driver Info";
                key = "dvrname";
                mnemonic = "I";
            }
            : toggle {
                label = "Crop Marks";
                key = "cropmarks";
                mnemonic = "M";
            }
        }
    }
    : column {
        : text {
            key = "commentlabel";
            label = "Comments: (50 Characters Max)";
            mnemonic = "C";
        }
        : edit_box {
            key = "comment";
            width = 51;
            edit_limit = 50;
        }
    }
    : row {
        fixed_width = true;
        alignment = centered;
        : retirement_button {
            label = "OK";
            key = "accept";
            width = 12;
            is_default = true;
        }
        : retirement_button {
            label = "Cancel";
            key = "cancel";
            width = 12;
            is_cancel = true;
        }
        : button {
            label = "Help...";
            key = "helpanno";
            mnemonic = "H";
            width = 12;
        }
    }
}

//-------------------------------------------------------------------------
//
//  HELP:  Displays a help screen based on which dialog box the user
//         is interacting with.
//
//-------------------------------------------------------------------------
help: dialog {
    label = "Help/Info";
    initial_focus = "accept";
    : list_box {
        width = 55;
        height = 16;
        key = "helplist";
    }
    : retirement_button {
        label = "OK";
        key = "accept";
        is_default = true;
        is_cancel = true;
    }
}

//-------------------------------------------------------------------------
//
//  OKALLPENS:  Dialog box to apply currently defined settings to all pens
//
//-------------------------------------------------------------------------
okallpens: dialog {
    fixed_width = true;
    alignment = centered;
    label = "!! CAUTION !!";
    initial_focus = "accept";
    : text {
        label = "OK to apply settings to ALL pens?";
        key = "askok";
    }
    : row {
        alignment = centered;
        : retirement_button {
            label = "OK";
            key = "accept";
            width = 12;
            is_default = true;
        }
        : retirement_button {
            label = "Cancel";
            key = "cancel";
            width = 12;
            is_cancel = true;
        }
    }
}

//-------------------------------------------------------------------------
//
//  GENERICORIENT:  Dialog box to set media/drawing orientation (for
//                  devices / AutoCAD versions not using Object Banding)
//
//-------------------------------------------------------------------------
GenericOrient : dialog {
    label = "Media Orientation";
    initial_focus = "accept";
    : boxed_row {
        label = "Click on Match for Your Image and Media";
        mnemonic = "C";
        fixed_width = true;
        fixed_height = true;
        spacer_0;
        : column {
            fixed_width = true;
            fixed_height = true;
            : image_button {
                key = "image1";
                width = 14;
                aspect_ratio = 0.65;
            }
            : image_button {
                key = "image3";
                width = 14;
                aspect_ratio =0.65;
            }
            : image_button {
                key = "image5";
                width = 14;
                aspect_ratio =0.65;
            }
            : image_button {
                key = "image7";
                width = 14;
                aspect_ratio = 0.65;
            }
        }
        spacer_0;
        : column {
            fixed_width = true;
            fixed_height = true;
            : image_button {
                key = "image2";
                width = 14;
                aspect_ratio = 0.65;
            }
            : image_button {
                key = "image4";
                width = 14;
                aspect_ratio = 0.65;
            }
            : image_button {
                key = "image6";
                width = 14;
                aspect_ratio = 0.65;
            }
            : image_button {
                key = "image8";
                width = 14;
                aspect_ratio = 0.65;
            }
        }
        spacer_0;
    }
    : row {
        fixed_width = true;
        alignment = centered;
        : retirement_button {
            label = "OK";
            key = "accept";
            width = 12;
            is_default = true;
        }
        : retirement_button {
            label = "Cancel";
            key = "cancel";
            width = 12;
            is_cancel = true;
        }
        : button {
            label = "Help...";
            mnemonic = "H";
            key = "helppaper";
        }
    }
}

//-------------------------------------------------------------------------
//
//  BANDINGORIENT:  Dialog box to set media/drawing orientation (for
//                  devices using Object Banding)
//
//-------------------------------------------------------------------------
BandingOrient : dialog {
    label = "Media Orientation";
    initial_focus = "accept";
    : boxed_row {
        label = "Click on Match for Your Image and Media";
        mnemonic = "C";
        fixed_width = true;
        fixed_height = true;
        spacer_0;
        : column {
            fixed_width = true;
            fixed_height = true;
            : image_button {
                key = "image1";
                width = 14;
                aspect_ratio = 0.65;
            }
            : image_button {
                key = "image7";
                width = 14;
                aspect_ratio = 0.65;
            }
        }
        spacer_0;
        : column {
            fixed_width = true;
            fixed_height = true;
            : image_button {
                key = "image6";
                width = 14;
                aspect_ratio = 0.65;
            }
            : image_button {
                key = "image8";
                width = 14;
                aspect_ratio = 0.65;
            }
        }
        spacer_0;
    }
    : row {
        fixed_width = true;
        alignment = centered;
        : retirement_button {
            label = "OK";
            key = "accept";
            width = 12;
            is_default = true;
        }
        : retirement_button {
            label = "Cancel";
            key = "cancel";
            width = 12;
            is_cancel = true;
        }
        : button {
            label = "Help...";
            mnemonic = "H";
            key = "helppaper";
        }
    }
}

//-------------------------------------------------------------------------
//
//  PAPERADV:  Dialog box for Advanced Media Options
//
//-------------------------------------------------------------------------
paperadv : dialog {
    label = "Advanced Media Options";
    initial_focus = "accept";
    : boxed_row {
        label = "Plot options:";
        : column {
            : toggle {
                label = "Disable Automatic Cutter";
                key = "disCutter";
                mnemonic = "C";
            }
            : toggle {
                label = "Save Paper";
                key = "InkedArea";
                mnemonic = "P";
            }
        }
        //----------------------------------
        // Another column can be added here
        //----------------------------------
    }
    spacer_1;
    : boxed_row {
        label = "Select level of control for plotter margins:";
        : boxed_radio_column {
            label = "If Scaled to Fit is OFF";
            key = "sclmarginadj";
            : radio_button {
                label = "Display clip warnings";
                key = "sclwarnings";
                mnemonic = "w";
            }
            : radio_button {
                label = "Don't display warnings";
                key = "scldisabled";
                mnemonic = "D";
            }
        }
        : boxed_radio_column {
            label = "If Scaled to Fit is ON";
            key = "marginadj";
            : radio_button {
                label = "Don't clip. Adjust to media";
                key = "adjust";
                mnemonic = "A";
            }
            : radio_button {
                label = "Display clip warnings";
                key = "warnings";
                mnemonic = "w";
            }
            : radio_button {
                label = "Don't display warnings";
                key = "disabled";
                mnemonic = "D";
            }
        }
    }
    spacer_1;
    : boxed_column {
        label = "Plotter Margins:";
        : radio_row {
            key = "expand";
            : radio_button {
                label = "Smaller";
                key = "marg1";
                mnemonic = "S";
            }
            : radio_button {
                label = "Normal";
                key = "marg0";
                mnemonic = "N";
            }
            : radio_button {
                label = "Extended";
                key = "marg2";
                mnemonic = "E";
            }
        }
        : text {
            label = "Must correspond to plotter setting";
        }
    }
    spacer_1;
    : row {
        fixed_width = true;
        alignment = centered;
        : retirement_button {
            label = "OK";
            key = "accept";
            width = 12;
            is_default = true;
        }
        : retirement_button {
            label = "Cancel";
            key = "cancel";
            width = 12;
            is_cancel = true;
        }
        : button {
            label = "Help...";
            mnemonic = "H";
            key = "helpadv";
        }
    }
}

//-------------------------------------------------------------------------
//
//  PRINTOPS:  Dialog box to set halftoning type
//
//-------------------------------------------------------------------------
printops : dialog {
    label = "Halftoning";
    initial_focus = "accept";
    : row {
        : radio_column {
            key = "dither";
            : radio_button {
                label = "Scatter";
                key = "scatter";
                mnemonic = "S";
            }
            : radio_button {
                label = "Pattern";
                key = "pattern";
                mnemonic = "P";
            }
            : radio_button {
                label = "Plotter default";
                key = "default";
                mnemonic = "d";
            }
        }
        : column {
            fixed_width = true;
            fixed_height = true;
            : image {
                key = "sc_im";
                height = 1;
                aspect_ratio = 6;
            }
            : image {
                key = "pt_im";
                height = 1;
                aspect_ratio = 6;
            }
            spacer_1;
        }
    }
    : row {
        fixed_width = true;
        alignment = centered;
        : retirement_button {
            label = "OK";
            key = "accept";
            width = 12;
            is_default = true;
        }
        : retirement_button {
            label = "Cancel";
            key = "cancel";
            width = 12;
            is_cancel = true;
        }
        : button {
            label = "Help...";
            mnemonic = "H";
            key = "helpprintop";
        }
    }
}

//-------------------------------------------------------------------------
//
//  ABOUTMSG:  About box
//
//-------------------------------------------------------------------------
aboutmsg : dialog {
    label = "About";
    width  = 64;
    : text {
        key = "DriverVersion";
        alignment = centered;
    }
    : text {
        key = "APDVersion";
        alignment = centered;
    }
    : text {
        key = "AboutHeaderKey";
        alignment = centered;
    }
    : list_box {
        fixed_height = true;
        height = 12;
        key =  "AboutKey";
    }
    : button {
        label = "OK";
        key = "accept";
        fixed_width = true;
        alignment = centered;
        width = 12;
        is_default = true;
    }
}

// The End// Next available MSG number is    38 
// MODULE_ID DDATTDEF_DCL_
/* Next available MSG number is  38 */
//
//     ddattdef.dcl
//
//     Copyright 1992, 1994, 1996 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.
//------------------------------------------------------------------------
//  DESCRIPTION
//
//  This is the dialogue box definition file for the DDATTDEF command. This
//  is an enhancement to the ATTDEF command. It loads up a dialogue box
//  which presents to the user all the prompts and options that he/she
//  might encounter during the definition of one or several attributes.
//
//------------------------------------------------------------------------


//dcl_settings : default_dcl_settings { audit_level = 3; }


ddattdef : dialog {
    label = "Attribute Definition";
    : row {
        : boxed_column {
            label = "Mode";
            : toggle {
                label = "Invisible";
                mnemonic = "I";
                key = "invisible";
            }
            : toggle {
                label = "Constant";
                mnemonic = "C";
                key = "constant";
            }
            : toggle {
                label = "Verify";
                mnemonic = "V";
                key = "verify";
            }
            : toggle {
                label = "Preset";
                mnemonic = "P";
                key = "preset";
            }
        }
        : boxed_column {
            label = "Attribute";
            fixed_width = true;
            width = 40;

            : edit_box {
                label = "Tag:";
                mnemonic = "T";
                key = "att_tag";
                edit_width = 30;
                edit_limit = 256;
            }
            : edit_box {
                label = "Prompt:";
                mnemonic = "P";
                key = "att_prompt";
                edit_width = 30;
                edit_limit = 256;
            }
            : edit_box {
                label = "Value:";
                mnemonic = "V";
                key = "def_val";
                edit_width = 30;
                edit_limit = 256;
            }
        }
    }
    : row {
        : boxed_column { 
            label = "Insertion Point";
            : button {
                label = "Pick Point <";
                mnemonic = "k";
                key = "pick_pt";
            }
            : edit_box {
                label = "X:";
                mnemonic = "X";
                key = "x_pt";
                edit_width = 10;
            }
            : edit_box {
                label = "Y:";
                mnemonic = "Y";
                key = "y_pt";
                edit_width = 10;
            }
            : edit_box {
                label = "Z:";
                mnemonic = "Z";
                key = "z_pt";
                edit_width = 10;
            }
        }
        : boxed_column {
            label = "Text Options";
            fixed_width = true;
            width = 40;
            : column {
                : popup_list {
                    label = "Justification:";
                    key = "cjustif";
                    edit_width = 20;
                    mnemonic = "J";
                }
                : popup_list {
                    label = "Text Style:";
                    key = "tstyle";
                    edit_width = 20;
                    mnemonic = "T";
                }
            }
            : row {
                : button {
                    label = "Height <";
                    key = "bheight";
                    mnemonic = "e";
                    width = 15;
                    fixed_width = true;
                }
                : edit_box {
                    key = "height";
                    edit_width = 20;
                    value = "0.2000";
                    fixed_width = true;
                }
            }
            : row {
                : button {
                    label = "Rotation <";
                    key = "brot";
                    mnemonic = "R";
                    width = 15;
                    fixed_width = true;
                }
                : edit_box {
                    key = "rot";
                    edit_width = 20;
                    fixed_width = true;
                }
            }
        }
    }
    : toggle {
        label = "Align below previous attribute";
        key = "align_prev";
        fixed_width = true;
        mnemonic = "A";
    }
    ok_cancel_help_errtile;
}



// Next available MSG number is    25 
// MODULE_ID DDCHPROP_DCL_
/* Next available MSG number is  23 */

//     DDCHPROP.DCL        Version 1.0
//
//     Copyright 1991, 1992, 1993, 1994, 1996 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.
//
//    Dialogue for the DDCHPROP command, for use with DDCHPROP.LSP
//


//dcl_settings : default_dcl_settings { audit_level = 3; }


textbox : edit_box {
    vertical_margin = tiny;
    horizontal_margin = tiny;
}

ch_prop : dialog {
    label = "Change Properties";
    : row {
        : column {
            fixed_width = true;
            : row {
                : button {
                    label = "Color...";
                    mnemonic = "C";
                    key = "b_color";
                    width = 16;
                    fixed_width = true;
                }
                : image_button {
                    key = "show_image";
                    height = 1;
                    width = 3;
                }
                : text {
                    key = "t_color";
                    width = 31;
                }
            }
            : row {
                : button {
                    label = "Layer...";
                    mnemonic = "L";
                    key = "b_name";
                    width = 16;
                    fixed_width = true;
                }
                : spacer { width = 3; }
                : text {
                    key = "t_layer";
                    width = 31;
                }
            }
            : row {
                : button {
                    label = "Linetype...";
                    mnemonic = "i";
                    key = "b_line";
                    width = 16;
                    fixed_width = true;
                }
                : spacer { width = 3; }
                : text {
                    key = "t_ltype";
                    width = 31;
                }
            }
        }
    }
    spacer;
    : row {
       alignment = left;
       : text_part {
           label = "Linetype Scale:";
	       mnemonic = "S";
	       width = 16;
	       fixed_width = true;
	   }
       : edit_box {
	       key = "eb_ltscale";
           edit_width = 18;
           fixed_width = true;
           width = 35;
       }
    }
    : row {
       alignment = left;
       : text_part {
           label = "Thickness:";
           mnemonic = "T";
	       width = 16;
	       fixed_width = true;
       }
       : edit_box {
           key = "eb_thickness";
           edit_width = 18;
           fixed_width = true;
           width = 35;
       }
    }
    spacer;
    ok_cancel_help_errtile;
}

setcolor : dialog {
    label = "Select Color";
    image_block;
    : list_box {
        key = "list_col";
        allow_accept = true;
    }
    : textbox {
        key = "edit_col";
        allow_accept = false;
        label = "Color Code:";
        edit_width = 13;
     }
     ok_cancel_err;
}

setltype : dialog {
    label = "Select Linetype";
    image_block;
    : list_box {
        height = 12;
		key = "list_lt";
        allow_accept = true;
    }
    : edit_box {
        key = "edit_lt";
        allow_accept = false;
        label = "Linetype:";
        mnemonic = "L";
	    edit_width = 32;
	    edit_limit = 217;
    }
    ok_cancel_err;   
}

setlayer : dialog {
    subassembly = 0;
    label = "Select Layer";
    initial_focus = "listbox";
    : concatenation {
        children_fixed_width = true;
        key = "clayer";
        : text_part {
            label = "Current Layer: ";
        }
        : text_part {
            key = "cur_layer";
            width = 35;
        }
    }
    : list_box {
        height = 12;
        key = "list_lay";
        allow_accept = true;
    }
    : row {
        key = "controls";
        : column {
            key = "lname";
            fixed_width = true;
            : edit_box {
                label = "Set Layer Name:";
                mnemonic = "S";
                key = "edit_lay";
                edit_width = 32;
                edit_limit = 217;
                allow_accept = true;
            }
        }
    }
    ok_cancel_err;
}


// Next available MSG number is    17 
// MODULE_ID DDGRIPS_DCL_
/* Next available MSG number is  18 */

//----------------------------------------------------------------------------
//
//     ddgrips.dcl
//
//     Copyright 1992, 1994, 1996 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.
//    
//----------------------------------------------------------------------------


//dcl_settings : default_dcl_settings { audit_level = 3; }


ddgrips : dialog {
    label = "Grips";
    : boxed_column {
        label = "Select Settings";
        : toggle {
            label = "Enable Grips";
            key = "grips";
            mnemonic = "E";
            fixed_width = true;
        }
        : toggle {
            label = "Enable Grips Within Blocks";
            key = "gripblock";
            mnemonic = "B";
            fixed_width = true;
        }
    }
    : boxed_column {
         label = "Grip Colors";
         : row {
             : column {
                 : button {
                     label = "Unselected...";
                     key = "cool_color";
                     mnemonic = "U";
                 }
                 : button {
                     label = "Selected...";
                     key = "hot_color";
                     mnemonic = "S";
                 }
             }
             : column {
                 : image {
                     key = "cool_image";
                     height = 1;
                     width = 3;
                     fixed_width = true;
                     fixed_height = true;
                 }
                 : image {
                     key = "hot_image";
                     height = 1;
                     width = 3;
                     fixed_width = true;
                     fixed_height = true;
                 }
             }
             : column {
                 : text {
                     label = "Blue";
                     key = "cool_text";
                     width = 11;
                 }
                 : text {
                     label = "Red";
                     key = "hot_text";
                     width = 11;
                 }
             }
        }
    }
    : boxed_row {
        label = "Grip Size";
        mnemonic = "G";
        spacer_0;
       : column {
            spacer_0;
            fixed_width = true;
            : text {
                label = "Min         Max";
                alignment = centered;
            }
            : slider {
                key = "grip_slider";
                min_value = 0;
                max_value = 19;
                width = 20;
                height = 1;
                small_increment = 1;
                big_increment = 1;
                fixed_width = true;
                fixed_height = true;
            }
            spacer_0;
        }
        : image {
            key = "grip_image";
            aspect_ratio = 1;
            height = 4;
            width = 7;
            color = -2;
        }
        spacer_0;
    }
    ok_cancel_help;
}



// Next available MSG number is   120
// MODULE_ID DDIM_DCL_
/* Next available MSG number is 185 */
//
//     DDIM.DCL      Version 1.0
//
//     Copyright 1991, 1992, 1993, 1994, 1995, 1996 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.
//
//

ddimx_row :row{
    children_alignment = bottom;
}

//
// Dimension line color
//
ddimx_colord :ddimx_row{

    :button{
        label = "&Color...";
        key = "clrdl";
    }
    :spacer{ width = 7; }
    :swatch{
        key = "clrd";
    }
    :edit_box{
        key = "clrdt";
        edit_width = 12;
    }
}

//
// Extension line color
//
ddimx_colore :ddimx_row{

    :button{
        label = "Colo&r...";
        key = "clrel";
    }
    :spacer{ width = 7; }
    :swatch{
            key = "clre";
    }
    :edit_box{
        key = "clret";
        edit_width = 12;
    }
}
//
// Dimension text color
//
ddimx_colort :ddimx_row{

    :button{
        label = "&Color...";
        key = "clrtl";
        fixed_width = true;
        width = 10;
    }
    :spacer{ width = 7; }
    :swatch{
        key = "clrt";
    }
    :edit_box{
        key = "clrtt";
        edit_width = 12;
    }
}

ddimx_alert :dialog{
    label = "ALERT";
    :text{
        label = "Save changes to current style?";
        key = "dalert_sty";
        alignment = centered;
    }
    :spacer{ height = 0.5; }
    :row{
        fixed_width = true;
        alignment = centered;
        :button{
            label = "&Yes";
            key = "dalert_save";
            width = 8;
            fixed_width = true;
        }
        :spacer{ width = 1; }
        :button{
            label = "&No";
            key = "dalert_discard";
            width = 8;
            fixed_width = true;
        }
        :spacer{ width = 1; }
        :button{
            label = "&Cancel";
            key = "dalert_cancel";
            is_cancel = true;
            width = 8;
            fixed_width = true;
        }
    }
    :spacer{ height = 0.5; }
}

ddimx_alert_fam :dialog{
    label = "ALERT";

  //This alert message is:
  //  
  //      Running overrides can only be set for 
  //            Parent dimension styles.
  //
    :text{
        label = "Running overrides can only be set for";
        alignment = centered;
    }
    :text{
        label = "Parent dimension styles.";
        alignment = centered;
    }
    :spacer{ height = 0.5; }
    ok_only;
    :spacer{ height = 0.5; }
}

// ===============================================================
//
//  Dimension Style Main Dialog -  calls Geometry, Text Location
//                                  and Annotation subdialogs
//          
// ===============================================================

ddim :dialog{
    label = "Dimension Styles";
    :boxed_column{
        label = "Dimension Style";
        fixed_width = true;
        :row{
            :text_part{
                label = "&Current:";
                width = 9;
                fixed_width = true;
            }
            :popup_list{            // lists for current working dimstyles
                key = "style";
                list = "";
                edit_width = 31;
            }
        }
        :row{
            :text_part{
                label = "&Name:";     //  style name
                width = 9;
                fixed_width = true;
            }
            :edit_box{                        // for user to enter/specify 
                key = "editstyle";
                edit_width = 31;
                edit_limit = 217;
            }
        }
        :row{
            fixed_width = true;
            alignment = centered; 
            :button{                      // save/create edited dimstyle         
                label = "&Save";
                key = "save";
                width = 10;
            }
            :spacer{ width = 0.5; }
            :button{                      // rename selected dimstyle name
                label = "&Rename";
                key = "rename";
                width = 10;
            }
            :spacer{ width = 0.2; }
        }
    }
    :row{
        :boxed_row{

        // Since DCL doesn't support m x n matrix radio buttons,
        // we have to manually track the choice from multiple clusters
        // as if they were a sinble cluster.
        // When a button from the other cluster was selected, turn off 
        // the current button by sweeping the cluster first, then let
        // the chosen button on. This operation is done in apps.

            label = "Family";
            :radio_column{
                key = "family1";
                        :radio_button{
                            label = "&Parent";
                            key = "parent";
                        }
                        :radio_button{
                            label = "&Linear";
                            key = "linear";
                        }
                        :radio_button{
                            label = "Ra&dial";
                            key = "radius";
                        }
                        :radio_button{
                            label = "Ang&ular";
                            key = "angle";
                        }
            }
            :radio_column{
                key = "family2";
                // Somehow in this layout of clusters, they are
                // slightly off balanced. In other words, the buttons
                // in each clusters are not displayed horizontally. 
                // To correct the bias, we used a spacer of 1.5.

                        : spacer { height = 1.5; }
                        :radio_button{
                            label = "Dia&meter";
                            key = "diameter";
                        }
                        :radio_button{
                            label = "&Ordinate";
                            key = "ordinate";
                        }
                        :radio_button{
                            label = "L&eader";
                            key = "leader";
                        }
            }
        }
        :column{
            alignment = top;
            :spacer{ height = 0.7; }
            :button{                  // calls subdialog
                label = "&Geometry...";  
                key = "geometry";
            }
            :button{                  // calls subdialog
                label = "&Format...";
                key = "txtloc";
            }
            :button{                  // calls subdialog
                label = "&Annotation...";
                key = "annotation";
            }
        }
    }
    spacer;
    ok_cancel_help_errtile;
}

//
//  Dimension Geometry Subdialog
//

ddimx_geometry :dialog{
    label = "Geometry";
    :row{
        fixed_height = true;
        :column{
            :boxed_column{
            //
            // This is boxed column for Dimension Line.
            //
                label = "Dimension Line";
                key = "g_diml";
                :row{
                    :text{
                        label = "Suppress: ";
                    }
                    :column{
                        :spacer{ height = 0.2; }
                        :toggle{
                            label = "&1st";
                            key = "sd1";
                        }
                    }
                    :column{
                        :spacer{ height = 0.2; } 
                        :toggle{
                            label = "&2nd";
                            key = "sd2";
                        }
                    }
                }
                :edit12_box{
                    label = "&Extension: ";
                    key = "dle";
                }
                :edit12_box{
                    label = "Sp&acing: ";
                    key = "dli";
                }
                ddimx_colord;
            }
            :boxed_column{
            //
            // This is boxed column for Extension Line.
            //
                label = "Extension Line";
                key = "extline";
                :row{
                    key = "g_extl";
                    :text{
                        label = "Suppress: ";
                    }
                    :column{
                        :spacer{ height = 0.3; }
                        :toggle{
                            label = "1&st";
                            key = "se1";
                        }
                    }
                    :column{
                        :spacer{ height = 0.3; }
                        :toggle{
                            label = "2&nd";
                            key = "se2";
                        }
                    }
                }
                :edit12_box{
                    label = "E&xtension: ";
                    key = "exe";
                }
                :edit12_box{
                    label = "Origin O&ffset: ";
                    key = "exo";
                }
                ddimx_colore;
            }
        }
        :column{
            :boxed_column{
       
            // This is boxed column for Arrwos.
            // In this popup lists, 'User Arrow' will let you open another
            // subdialog called 'ddimx_userarr'. 

                label = "Arrowheads";
                key = "g_arrs";
                :row{
                    fixed_width = true;
                    alignment = right;
                    :image_button{
                        color                   = 0;
                        width                   = 8.7;
                        aspect_ratio            = 0.36;
                        fixed_height            = true;
                        fixed_width             = true;
                        alignment = right;
                        key = "arr_icon1";
                    }
                    :image_button{
                        color                   = 0;
                        width                   = 8.7;
                        aspect_ratio            = 0.36;
                        fixed_height            = true;
                        fixed_width             = true;
                        alignment = right;
                        key = "arr_icon2";
                    }
                }
                :popup_list{
                    label = "1s&t: ";
                    key = "blk1";
                    list = "None \nClosed \nDot \nClosed Filled \nClosed Blank \nOblique \nArchitectural Tick \nOpen \nOrigin Indication \nRight-Angle \nOpen 30 \nDot Blanked \nDot Small \nBox Filled \nBox \nDatum Triangle Filled \nDatum Triangle \nIntegral \nUser Arrow...";
                    edit_width = 20;
                }
                :popup_list{
                    label = "2n&d:";
                    key = "blk2";
                    list = "None \nClosed \nDot \nClosed Filled \nClosed Blank \nOblique \nArchitectural Tick \nOpen \nOrigin Indication \nRight-Angle \nOpen 30 \nDot Blanked \nDot Small \nBox Filled \nBox \nDatum Triangle Filled \nDatum Triangle \nIntegral \nUser Arrow...";
                    edit_width = 20;
                }
                :edit12_box{
                    label = "S&ize: ";
                    key = "asz";
                }
            }
            :boxed_column{
                key = "cenmarks";

            // This is boxed column for center marks. 
            // Choosing a button, its image will be shown in the image box.

                label = "Center";
                :row{
                    :radio_column{
                        key = "cen_mark";
                        :radio_button{
                            label = "&Mark";
                            key = "cen_mk";
                        }
                        :radio_button{
                            label = "&Line";
                            key = "cen_ln";
                        }
                        :radio_button{
                            label = "N&one";
                            key = "cen_no";
                        }
                    }
                    :image_button{
                        color                   = 0;
                        width                   = 11;
                        aspect_ratio            = 0.8;
                        fixed_height            = true;
                        fixed_width             = true;
                        alignment = centered;
                        key = "cen_icon"; 
                    }
                }
                :spacer { height = 0.1; }
                :edit12_box{
                    label = "Si&ze: ";
                    key = "cen";
                }
            }
        }
    }
    :boxed_column{
        label = "Scale";
        :row{
            :column{
                :edit12_box{
                    fixed_width = true;
                    label = "O&verall Scale: ";
                    key = "gdscl";
                }
                :spacer{ height = 0.1; }
            }
            :toggle{
                label = "Scale to &Paper Space";
                key = "pspace";
            }
        }
    }
    ok_cancel_help_errtile_too;
}

//
//  Dimension Text Location Subdialog
//

ddimx_txtloc :dialog{
    label = "Format";
    fixed_height = true;
    :row{
        :column{
            :column{
                :spacer{ height = 0.3; }
                :toggle{
                    label = "&User Defined";
                    key = "jus";
                }
                :toggle{
                    label = "Force &Line Inside";
                    key = "tofl";
                }
                :text {
                        label = "&Fit: ";

                }
                :popup_list{
                    key = "jfit";
                    list = "Text and Arrows\nText Only\nArrows Only\nBest Fit\nLeader\nNo Leader";
                }
                :spacer{ height = 0.5; }
            }
            :boxed_column{
            //
            // This is boxed column for Justification.
            //
                label = "Horizontal Justification";
                fixed_height = true;
                height = 6.5;
                :spacer{ height = 0.2; }
                :image_button{
                    color                   = 0;
                    width                   = 11;
                    aspect_ratio            = 0.8;
                    fixed_height            = true;
                    fixed_width             = true;
                    alignment = centered;
                    key = "horjust_icon"; 
                }
                :spacer{ height = 0.2; }
                :popup_list{
                    key = "horjust";
                    /*list now in DDIM_C_25..29, was DDIM_DCL_59*/
                }
                :spacer{ height = 0.2; }
            }
        }
        :column{
            :boxed_column{
                label = "Text";
                fixed_height = true;
                :image_button{
                    color                   = 0;
                    width                   = 11;
                    aspect_ratio            = 0.8;
                    fixed_height            = true;
                    fixed_width             = true;
                    alignment = centered;
                    key = "tioh_icon"; 
                }
                :row{
                    fixed_width = true;
                    :spacer{ width = 0.5; }
                    :column{
                        fixed_height = true;
                        :spacer{ height = 0.2; }
                        :toggle{
                            label = "&Inside Horizontal";
                            key = "tih";
                        }
                        :toggle{
                            label = "&Outside Horizontal";
                            key = "toh";
                        }
                    }
                }
            }
            :boxed_column{

            // This is Vertical Justification. 
            // Choose one, then highlight the related image box. 
            // Conversely you can choose a image box, then highlight 
            // the pull down list item.

                label = "Vertical Justification";
                fixed_height = true;
                height = 6.5;
                :spacer{ height = 0.2; }
                :image_button{
                    color                   = 0;
                    width                   = 11;
                    aspect_ratio            = 0.8;
                    fixed_height            = true;
                    fixed_width             = true;
                    alignment = centered;
                    key = "tad_icon"; 
                }
                :spacer{ height = 0.2; }
                :popup_list{
                    key = "tad";
                    list = "Centered \nAbove \nOutside \nJIS";
                }
                :spacer{ height = 0.2; }
            }
        }
    }
    :spacer{ height = 0.2; }
    ok_cancel_help_errtile;
}

//
//  Dimension Annotation Subdialog
//

ddimx_annotation :dialog{
    label = "Annotation";
    fixed_width = true;
    :row{
        :column{
            :boxed_column{
        
        // This is boxed column for Dimension units.
        // The 'Units' button opens another subdialog called 'ddimx_units'.
        // This part is for the primary units.

                label = "Primary Units";
                :row{
                    :button{
                        fixed_width = true;
                        label = "&Units...";
                        key = "annot_unitsp";
                    }
                }
                :edit_box{
                    label = "&Prefix: ";
                    key = "post_1";
                    edit_width = 12;
                    edit_limit = 91;
                }
                :edit_box{
                    label = "&Suffix: ";
                    key = "post_2";
                    edit_width = 12;
                    edit_limit = 105;
                }
                :icon_image{
                    color                   = 0;
              //      width                   = 14;
                    height = 2;
                    aspect_ratio            = 0.45;
                    fixed_height            = true;
                    fixed_width             = true;
                    alignment = right;
                    key = "post_icon1"; 
                    allow_accept = false;
                }
            }
            :boxed_column{
            //
            // This is boxed portion for Tolerance.
            //
                label = "Tolerance";
                :popup_list{
                    label = "&Method: ";
                    key = "toltypes";
                    list = "None \nSymmetrical \nDeviation \nLimits \nBasic";
                    edit_width = 16;
                }
                :edit12_box{
                    label = "Upper &Value: ";
                    key = "tp";
                }
                :edit12_box{
                    label = "Lo&wer Value: ";
                    key = "tm";
                }
                :popup_list{
                    label = "&Justification: ";
                    key = "tolj";
                    list = "Top \nMiddle \nBottom";
                    edit_width = 10;
                }
                :edit12_box{
                    label = "He&ight: ";
                    key = "tfac";
                }
            }
            :spacer{ height = 0.1; }
        }
        :column{
            :boxed_column{

            // This is boxed column for alternate dimunits.
            // The 'Units' button opens another subdialog 'ddimx_units',
            // but this one is for Alternate Units and the values in
            // ddimx_units subdialog are of the alternate units. It is
            // different from the stuff for the primary units.

                label = "Alternate Units";
                key = "alts";
                :row{
                    :toggle{
                        label = "&Enable Units";
                        key = "alt";
                    }
                    :button{
                        fixed_width = true;
                        label = "U&nits...";
                        key = "annot_unitsa";
                    }
                }
                :column{
                    key = "apost";
                    :edit_box{
                        label = "Pre&fix: ";
                        key = "apost_1";
                        edit_width = 12;
                        edit_limit = 91;
                    }
                    :edit_box{
                        label = "Suffi&x: ";
                        key = "apost_2";
                        edit_width = 12;
                        edit_limit = 105;
                    }
                    :icon_image{
                        color                   = 0;
                //        width                   = 14;
                        height = 2;
                        aspect_ratio            = 0.45;
                        fixed_height            = true;
                        fixed_width             = true;
                        alignment = right;
                        key = "post_icon2"; 
                        allow_accept = false;  
                  }
                }
            }
            :boxed_column{
                label = "Text";
                :popup_list{
                    label = "Sty&le: ";
                    key = "txsty";
                    edit_witdh = 31;
                    list = "";
                }
                :edit12_box{
                    label = "Heigh&t: ";
                    key = "txt";
                }
                :edit12_box{
                    label = "&Gap: ";
                    key = "gap";
                }

                ddimx_colort;
            }
            :edit12_box{
                label = "&Round Off:";
                key = "rnd";
            }
            :spacer{ height = 0.2; }
        }
    }
    ok_cancel_help_errtile_too;
}

//
//  Dimension Units Subdialog - This is called by Annotation dialog.
//                              There are two calling cases, one for 
//                              the primary units and another is for
//                              the alternate units.
//

ddimx_unitsp :dialog{
    label = "Primary Units";
    fixed_width = true;

    units_list;
    units_ufac;

    ok_cancel_help_errtile_too;
}


ddimx_unitsa :dialog{
    label = "Alternate Units";
    fixed_width = true; 

    units_list;
    units_ufac;

    ok_cancel_help_errtile_too;
}

units_ufac :column{
    :boxed_row{
        label = "Scale";
        :column{
            :edit12_box{
                label = "Linea&r: ";
                key = "ufac";
            }
            :spacer{ height = 0.2; }
        }
        :spacer { width = 5; }
        :toggle{
            label = "Paper &Space Only";
            key = "psufac";
        }
    }
}

units_list :column{
    //
    // Horizontal cluster that contains the Units and Angles clusters.
    //
        //
        // Units cluster.
        //
    :row{
        : boxed_column {
            width = 24;
            label = "&Units";
            //
            // Radio cluster for the units format selection.
            //
            : popup_list {
                key = "u_list";
                list = "Scientific\nDecimal\nEngineering\nArchitectural (stacked)\nFractional (stacked)\nArchitectural\nFractional\nWindows Desktop";
            }
            :spacer{ height = 0.2; }
        }
        //
        // Angle Formats Control.
        //
        : boxed_column {
            width = 24;
            label = "&Angles";
            //
            // Radio cluster for the angle format selection.
            //
            : popup_list {
                key = "u_alist";
                list = "Decimal Degrees \nDeg/Min/Sec \nGrads \nRadians \nSurveyor";
            }
            :spacer{ height = 0.2; }
        }
    }
    :row{
        :boxed_column{
            label = "Dimension";
            //
            // Linear Units Precision popup_list (System variable LUPREC).
            //
            : text {
                label = "&Precision:";
            }
            : popup_list {
                key = "u_dimdec";
            }
            :boxed_row{
                label = "Zero Suppression";
                key = "zsuppress";
                :column{
                    :toggle{
                        label = "&Leading";
                        key = "z3";
                    }
                    :toggle{
                        label = "&Trailing";
                        key = "z4";
                    }
                }
                :column{
                    key = "feetinch";
                    :toggle{
                        label = "0 &Feet";
                        key = "z1";
                    }
                    :toggle{
                        label = "0 &Inches";
                        key = "z2";
                    }
                }
            }
        }
        :boxed_column{
            label = "Tolerance";
            //
            // Angle Precision popup_list (system variable AUPREC).
            //
            spacer_0;
            : text {
                label = "Precisi&on:";
            }    
            : popup_list {
                key = "u_toldec";
            }

            :boxed_row{
                label = "Zero Suppression";
                key = "tzsuppress";
                :column{
                    :toggle{
                        label = "Lea&ding";
                        key = "tz3";
                    }
                    :toggle{
                        label = "Traili&ng";
                        key = "tz4";
                    }
                }
                :column{
                    key = "tfeetinch";
                    :toggle{
                        label = "0 F&eet";
                        key = "tz1";
                    }
                    :toggle{
                        label = "0 In&ches";
                        key = "tz2";
                    }
                }
            }
        }
    }
}


//
//  User Arrow subdialog - This is called by Geometry when the user 
//                         selects 'User Arrow' tile.
//                         This dialog allows for the user to set user
//                         arrow head block names.
//

ddimx_userarr :dialog{
    label = "User Arrow";
    fixed_width = true;
    :spacer{ height = 0.3; }
    :edit_box{
        label = "Arrow &Name: ";
        key = "userarr1";
        fixed_width = true;
        allow_accept = true;
        alignment = centered;
        edit_width = 12;
        edit_limit = 217;
    }
    :spacer{ height = 0.5; }
    ok_cancel_help_errtile;
}

//==========================================================
//    'rq_chroma:dialog{}' must be present here because DDIM.DCL
//    can not share the same dcl function defined in ACAD.DCL since
//    DDIM has been separated from ACAD.DCL.
//    

// The standard color selection dialogue comes to ADS
// The meat of the dialogue is defined in base.dcl and used here and in
//    acad.dcl.

rq_chroma :dialog {
    label = "Select Color";
    key = "chroma";                   // used by Help button to obtain label
    initial_focus = "color_edit";
    std_rq_color;
}

ok_cancel_help_errtile_too : column {
    :row {
        errtile;
        ok_cancel_help;
    }
}

// ==== End of the DDIMX dialogs portion ====


// Next available MSG number is    39 
// MODULE_ID DDINSERT_DCL_
/* Next available MSG number is  41 */

//----------------------------------------------------------------------------
//
//     ddinsert.dcl
//
//     Copyright 1992, 1994, 1996 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.
//----------------------------------------------------------------------------
//
// Corresponding dialogues for DDINSERT.LSP which is an AutoLISP implementation
// of the AutoCAD Insert command with a dialogue interface.
//
//----------------------------------------------------------------------------


//dcl_settings : default_dcl_settings { audit_level = 3; }


ddinsert : dialog {
    label = "Insert";
    : boxed_column {
	label = "Block";
	: row {
	    : button {
		label = "Block...";
		key = "int_blocks";
		mnemonic = "B";
		width = 10;
		fixed_width = true;
	    }
	    : edit_box {
		label = "";
		key = "current_name";
		width = 36;
		edit_limit = 217;
	    }
	}
	: row {
	    : button {
		label = "File...";
		key = "ext_blocks";
		mnemonic = "F";
		width = 11.7;
		fixed_width = true;
	    }
	    : edit_box {
		key = "path_name";
		width = 36;
	    }
	}
    }
    : boxed_column {
	label = "Options";
	: row {
	    : toggle {
		label = "Specify Parameters on Screen";
		key = "on_screen";
		mnemonic = "S";
		fixed_width = true;
	    }
	}
	: row {
	    : boxed_column {
		label = "Insertion Point";
		: edit_box {
		    label = "X:";
		    mnemonic = "X";
		    key = "x_pt";
		    edit_width = 10;
		}
		: edit_box {
		    label = "Y:";
		    mnemonic = "Y";
		    key = "y_pt";
		    edit_width = 10;
		}
		: edit_box {
		    label = "Z:";
		    mnemonic = "Z";
		    key = "z_pt";
		    edit_width = 10;
		}
	    }
	    : boxed_column {
		label = "Scale";
		: edit_box {
		    label = "X:";
		    mnemonic = "X";
		    key = "x_scale";
		    edit_width = 10;
		}
		: edit_box {
		    label = "Y:";
		    mnemonic = "Y";
		    key = "y_scale";
		    edit_width = 10;
		}
		: edit_box {
		    label = "Z:";
		    mnemonic = "Z";
		    key = "z_scale";
		    edit_width = 10;
		}
	    }
	    : column {
		: boxed_column {
		    label = "Rotation";
		    fixed_height = true;
		    : edit_box {
			label = "Angle:";
			key = "rotation";
			mnemonic = "A";
			edit_width = 6;
		    }
		}
	    }
	}
    }
    : toggle {
	label = "Explode";
	key = "explode";
	mnemonic = "E";
	fixed_width = true;
    }
    ok_cancel_help_errtile;
}


list_blocks : dialog {
    label = "Defined Blocks";
    : edit_box {
	label = "Pattern:";
	key = "pattern";
	mnemonic = "P";
	allow_accept=true;
	is_default=true;
    }
    : list_box {
	key = "bl_match";
	width = 32;
	allow_accept = true;
    }
    : edit_box {
	label = "Selection:";
	key = "selection";
	mnemonic = "S";
	allow_accept=true;
	edit_limit = 217;
    }
    spacer;
    ok_cancel_err;
}

blk_exists : dialog {
    label = "Warning";
    : paragraph {
	: text_part {
	    label = "A Block with this name already exists in the drawing.";
	}
	: text_part {
	    label = "Do you want to redefine it?";
	}
    }
    spacer_1;
    : row {
	fixed_width = true;
	alignment = centered;
	: button {
	    label = "OK";
	    key = "redefine";
	    width = 8;
	}
	: spacer {
	    width = 2;
	}
	: default_button {
	    label = "Cancel";
	    key = "no";
	    width = 8;
	}
    }
}


// Next available MSG number is     8 
// MODULE_ID DDPTYPE_DCL_
/* Next available MSG number is  17 */

//----------------------------------------------------------------------------
//
//     ddptype.dcl
//
//     Copyright 1992, 1994, 1996 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.
//----------------------------------------------------------------------------
//
//  Ddptype.dcl - Point size and type selection dialogue.
//
//----------------------------------------------------------------------------

//  DDPTYPE dialogue.  Used by the DDPTYPE command in ddptype.lsp.
//  Called from the AutoCAD Release 12 Standard Menu.

//dcl_settings : default_dcl_settings { audit_level = 3; }

ddptype: dialog {
  label        = "Point Style";
  : column {
    : row {
      : image_button {
        key          = "pdmode0";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode1";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode2";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode3";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode4";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
    }
    : row {
      : image_button {
        key          = "pdmode32";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode33";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode34";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode35";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode36";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
    }
    : row {
      : image_button {
        key          = "pdmode64";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode65";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode66";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode67";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode68";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
    }
    : row {
      : image_button {
        key          = "pdmode96";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode97";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode98";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode99";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
      : image_button {
        key          = "pdmode100";
        width        = 5;
        aspect_ratio = 1.0;
        color        = 0;
        allow_accept = true;
      }
    }
  }
  : column {
    fixed_height = true;
    spacer_1;
    : row {
      : edit_box {
        mnemonic             = "S";
        label                = "Point Size:";
        key                  = "pdsize_value";
        edit_width           = 10;
        horizontal_alignment = left;
        allow_accept         = true;
      }
      : text {
        label = "";
        key   = "pdsize_label";
        width = 12;
      }
    }
    : radio_column {
      fixed_height = true;
      : radio_button {
        label       = "Set Size Relative to Screen";
        mnemonic    = "R";
        key         = "pdsize_r";
        is_tab_stop = false;
      }
      : radio_button {
        label       = "Set Size in Absolute Units";
        mnemonic    = "A";
        key         = "pdsize_a";
        is_tab_stop = false;
      }
    }
  }
  spacer_1;
  ok_cancel_help_errtile;
}

// Next available MSG number is     6 
// MODULE_ID DDRENAME_DCL_
/* Next available MSG number is   9 */

//----------------------------------------------------------------------------
//
//   DDRENAME.DCL   Version 1.0
//
//     Copyright 1991, 1992, 1993, 1994, 1996 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.  
//----------------------------------------------------------------------------
// 
// Corresponding dialogue for DDRENAME.LSP which is an AutoLISP implementation
// of the AutoCAD Rename command with wildcard support and a dialogue
// interface.
// 
//----------------------------------------------------------------------------

//dcl_settings : default_dcl_settings { audit_level = 3; }


ddrename : dialog {
    label = "Rename";
    : row {
        : column {
            : list_box {
                label = "Named Objects";
                key = "tables";
                width = 17;
                height = 8;
            }
        }
        : column {
            : list_box {
                label = "&Items";
                key = "table_items";
				alignment = right;
				fixed_width = true;
                width = 35;
                height = 8;
                multiple_select = true;
            }
        }
    }
    : column {
        : row {
			: text {
		        label = "&Old Name:";
			}
	        : edit_box { 
			    key = "old";
				alignment = right;
				fixed_width = true;
				edit_width = 33;
				edit_limit = 217;
			}
		}
        : row {
            : button {
                label = "&Rename To:";
                key = "rename";
            }
            : edit_box { 
                label = "";
                key = "new";
				alignment = right;
				fixed_width = true;
                edit_width = 33;
				edit_limit = 217;
            }
        }
    }
    spacer_1;
    ok_cancel_help_errtile;
}

// Next available MSG number is     6 
// MODULE_ID DDUCSP_DCL_
/* Next available MSG number is  10 */

//----------------------------------------------------------------------------
//
//     dducsp.dcl
//
//     Copyright 1992, 1994, 1996 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.
//----------------------------------------------------------------------------
//
//  Dducsp.dcl - Ucs presets selection dialogue.
//
//----------------------------------------------------------------------------

//dcl_settings : default_dcl_settings { audit_level = 3; }

dducsp : dialog {
  aspect_ratio = 0;
  label = "UCS Orientation";
  initial_focus = "ucsp_front";
  : row {
    : column {
      : image_button {
        key = "ucsp_world";
        width = 7;
        aspect_ratio = 1.0;
        color = 0;
        allow_accept = true;
      }
      : image_button {
        key = "ucsp_left";
        width = 7;
        aspect_ratio = 1.0;
        color = 0;
        allow_accept = true;
      }
      : image_button {
        key = "ucsp_cview";
        width = 7;
        aspect_ratio = 1.0;
        color = 0;
        allow_accept = true;
      }
    }
    : column {
      : image_button {
        key = "ucsp_top";
        width = 7;
        aspect_ratio = 1.0;
        color = 0;
        allow_accept = true;
      }
      : image_button {
        key = "ucsp_front";
        width = 7;
        aspect_ratio = 1.0;
        color = 0;
        allow_accept = true;
      }
      : image_button {
        key = "ucsp_bottom";
        width = 7;
        aspect_ratio = 1.0;
        color = 0;
        allow_accept = true;
      }
    }
    : column {
      : image_button {
        key = "ucsp_back";
        width = 7;
        aspect_ratio = 1.0;
        color = 0;
        allow_accept = true;
      }
      : image_button {
        key = "ucsp_right";
        width = 7;
        aspect_ratio = 1.0;
        color = 0;
        allow_accept = true;
      }
      : image_button {
        key = "ucsp_prev";
        width = 7;
        aspect_ratio = 1.0;
        color = 0;
        allow_accept = true;
      }
    }
  }
  : row {
    : radio_column {
      : radio_button {
        label = "Relative to Current UCS";
        mnemonic = "R";
        key = "ucsp_r_ucs";
      }
      : radio_button {
        label = "Absolute to WCS";
        mnemonic = "A";
        key = "ucsp_a_wcs";
      }
    }
  }
  ok_cancel_help_errtile;
}

// Next available MSG number is    51 
// MODULE_ID DDUNITS_DCL_
/* Next available MSG number is  60 */

//-------------------------------------------------------------------------
//
//     ddunits.dcl
//
//     Copyright 1992, 1994, 1996 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.
//    
//-------------------------------------------------------------------------
// DESCRIPTION:
// Dialogue definition file for DDUNITS.LSP - Units command. 
//-------------------------------------------------------------------------

//dcl_settings : default_dcl_settings { audit_level = 3; }

ddunits : dialog {
    label = "Units Control";
    //
    // Horizontal cluster that contains the Units and Angles clusters.
    //
    : row {
        //
        // Units cluster.
        //
        : boxed_column {
            label = "Units";
            //
            // Radio cluster for the units format selection.
            //
            : radio_column {
                : radio_button {
                    key = "scientific";
                    label = "Scientific";
                    mnemonic = "S";
                }
                : radio_button {
                    key = "decimal";
                    label = "Decimal";
                    mnemonic = "c";
                }
                : radio_button {
                    key = "engineering";
                    label = "Engineering";
                    mnemonic = "E";
                }
                : radio_button {
                    key = "architectural";
                    label = "Architectural";
                    mnemonic = "A";
                }
                : radio_button {
                    key = "fractional";
                    label = "Fractional";
                    mnemonic = "F";
                }
            }
            //
            // Linear Units Precision popup_list (System variable LUPREC).
            //
            spacer;
            : text {
                label = "Precision:";
                mnemonic = "P";
            }
            : popup_list {
                key = "luprec";
                edit_width = 14;
            }
        }
        //
        // Angle Formats Control.
        //
        : boxed_column {
            label = "Angles";
            //
            // Radio cluster for the angle format selection.
            //
            : radio_column {
                : radio_button {
                  key = "decimal_deg";
                  label = "Decimal Degrees";
                  mnemonic = "i";
                }
                : radio_button {
                    key = "dms";
                    label = "Deg/Min/Sec";
                    mnemonic = "M";
                }
                : radio_button {
                    key = "grads";
                    label = "Grads";
                    mnemonic = "G";
                }
                : radio_button {
                    key = "radians";
                    label = "Radians";
                    mnemonic = "R";
                }
                : radio_button {
                    key = "surveyor_deg";
                    label = "Surveyor";
                    mnemonic = "v";
                }
            }
            //
            // Angle Precision popup_list (system variable AUPREC).
            //
            spacer_0;
            : text {
                label = "Precision:";
                mnemonic = "n";
            }    
            : popup_list {
                key = "auprec";
                edit_width = 17;
            }
        }
    }
    //
    // Row of buttons at bottom: OK Cancel Direction... Help...
    //
    : row {
        ok_button;
        cancel_button;
        : button {
             label = "Direction...";
             key = "dir";
             mnemonic = "D";
             fixed_width = true;
        }
        help_button;
    }
}
//
// Direction child dialog.
//
direction : dialog {
    label = "Direction Control";
    : boxed_column {
        label = "Angle 0 Direction";
        fixed_width = true;
        width =22;
        //
        // Direction sub-cluster to group the radio cluster and the
        // pick button/edit box cluster.
        //
        :row {
            //
            // Radio cluster for the direction selection.
            //
            : radio_column {
                : radio_button {
                    key = "east";
                    label = "East";
                    mnemonic = "E";
                }
                : radio_button {
                    key = "north";
                    label = "North";
                    mnemonic = "N";
                }
                : radio_button {
                    key = "west";
                    label = "West";
                    mnemonic = "W";
                }
                : radio_button {
                    key = "south";
                    label = "South";
                    mnemonic = "S";
                }
                : radio_button {
                    key = "other";
                    label = "Other";
                    mnemonic = "O";
                }
            }
            //
            // Angle direction format labels appears to the right
            // of the radio cluster, a "pick" button next to "other"
            //
            : column {
			children_alignment=right;
                : text {
                    key = "zero";
                    label = "";
                    width = 9;
                }
                : text {
                    key = "ninety";
                    label = "";
                }
                : text {
                    key = "one_eighty";
                    label = "";
                }
                : text {
                    key = "two_seventy";
                    label = "";
                }
                : text {
                    key = "typed";
                    label = "Pick/Type";
                }
            }
        }
        //
        // Manual angle selection and direction selection.
        //
        //
        // Angle edit box.
        //
        : edit_box {
            key = "angle_edit";
            edit_width = 14;
            label = "Angle:";
            mnemonic = "A";
        }
        : button{
            label = "Pick <";
            key = "angle_pick";
            fixed_width = true;
            width = 8;
            alignment = left;
            mnemonic = "P";
        }
    }
    //
    // Angle direction radio cluster.
    //
    : radio_column {
        : radio_button {
            key = "angle_dir_ccw";
            label = "Counter-Clockwise";
            mnemonic = "C";
        }
        : radio_button {
            key = "angle_dir_cw";
            label = "Clockwise";
            mnemonic = "l";
        }
    }
    ok_cancel;
    : errtile {
        width = 22;
    }
}
// End Direction child dialog.

// Next available MSG number is    54 
// MODULE_ID DDVIEW_DCL_
/* Next available MSG number is  61 */

//----------------------------------------------------------------------------
//
//     ddview.dcl
//
//     Copyright 1992, 1994, 1996 by Autodesk, Inc.
//
//     Permission to use, copy, modify, and distribute this software
//     for any purpose and without fee is hereby granted, provided
//     that the above copyright notice appears in all copies and
//     that both that copyright notice and the limited warranty and
//     restricted rights notice below appear in all supporting
//     documentation.
//
//     AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
//     AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
//     MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
//     DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
//     UNINTERRUPTED OR ERROR FREE.
//
//     Use, duplication, or disclosure by the U.S. Government is subject to
//     restrictions set forth in FAR 52.227-19 (Commercial Computer
//     Software - Restricted Rights) and DFAR 252.227-7013(c)(1)(ii)
//     (Rights in Technical Data and Computer Software), as applicable.
//
//.
//----------------------------------------------------------------------------
//
//  Dialogue interface to VIEW command.  Used with DDVIEW.LSP
//
//----------------------------------------------------------------------------

//dcl_settings : default_dcl_settings { audit_level = 3; }

view : dialog {
    label = "View Control";
    initial_focus = "edit_view";
    : list_box {
        label = "Views";
        mnemonic = "V";
        width = 42;
        tabs = "34";
        key = "list_view";
        tab_truncate = true;
    }
    : concatenation {
        : text_part {
            label = "Restore View: ";
        }
        : text_part {
            key = "res_text";
            width = 32;
        }
    }
    : row {
        : button {
            label = "Restore";
            mnemonic = "R";
            key = "restore";
        }
        : button {
            label = "New...";
            mnemonic = "N";
            key = "new_view";
        }
        : button {
            label = "Delete";
            mnemonic = "D";
            key = "delete";
        }
        : button {
            label = "Description...";
            mnemonic = "e";
            key = "describe";
        }
    }
    spacer_0;
    ok_cancel_help;
}

new_view : dialog {
    label = "Define New View";
    : edit_box {
        key = "new_view_name";
        allow_accept = false;
        label = "New Name:";
        mnemonic = "N";
        edit_width = 26;
        edit_limit = 2048;
    }
    : radio_column {
        : radio_button {
            label = "Current Display";
            mnemonic = "C";
            key = "r_current";
        }
        : radio_button {
            label = "Define Window";
            mnemonic = "D";
            key = "r_window";
        }
    }
    : button {
        label = "Window <";
        mnemonic = "W";
        width = 10;
        key = "window";
        horizontal_alignment = left;
        fixed_width = true;
    }
    : row {
        : boxed_column {
            label = "First Corner";
            key = "fc";
            : concatenation {
                : text_part {
                    label = "X: ";
                    key = "x1_label";
                }
                : text_part {
                    key = "x1_text";
                    width = 10;
                }
            }
            : concatenation {
                : text_part {
                    label = "Y: ";
                    key = "y1_label";
                }
                : text_part {
                    key = "y1_text";
                    width = 10;
                }
            }
        }
        : boxed_column {
            label = "Other Corner";
            key = "oc";
            : concatenation {
                : text_part {
                    label = "X: ";
                    key = "x2_label";
                }
                : text_part {
                    key = "x2_text";
                    width = 10;
                }
            }
            : concatenation {
                : text_part {
                    label = "Y: ";
                    key = "y2_label";
                }
                : text_part {
                    key = "y2_text";
                    width = 10;
                }
            }
        }
    }
    : row {
        fixed_width = true;
        alignment = centered;
        : button {
            label = "Save View";
            mnemonic = "S";
            key = "save_view";
            fixed_width = true;
        }
        : spacer { width = 2; }
        cancel_button;
    }
    errtile;
}


valert : dialog {
    label = "Alert";
    : paragraph {
        : text_part {
            label = "A View with this name already exists in this";
        }
        : text_part {
            label = "drawing.  Do you want to redefine it?";
        }
    }
    : row {
        fixed_width = true;
        alignment = centered;
        : button {
            label           = "Redefine";
            key             = "accept";
            mnemonic        = "R";
            is_default      = true;
            width           = 8;
        }
        : spacer {
            width = 2;
        }
        : button {
            label           = "Cancel";
            key             = "cancel";
            mnemonic        = "C";
            is_cancel       = true;
            width           = 6;
        }
    }
}

vinquiry : dialog {
    label = "View Description";
    : concatenation {
        : text {
            label = "View Name:";
        }
        : text {
            key = "v_name";
            width = 31;
        }
    }
    spacer_1;
    : row {
        : row {
            : column {
                spacer_1;
                : text {
                    label = "Width:";
                }
                : text {
                    label = "Height:";
                }
                : text {
                    label = "Twist:";
                }
            }
            : column {
                spacer_1;
                : text {
                    key = "v_width";
                    width = 10;
                }
                : text {
                    key = "v_height";
                    width = 10;
                }
                : text {
                    key = "v_twist";
                    width = 10;
                }
            }
        }
        spacer_1;
        : column {
            : text {
                key = "cen_tar";
                width = 15;
            } 
            : concatenation {
                : text_part {
                    label = "X: ";
                }
                : text_part {
                    key = "vtar_x";
                    width = 10;
                }
            }
            : concatenation {
                : text_part {
                    label = "Y: ";
                }
                : text_part {
                    key = "vtar_y";
                    width = 10;
                }
            }
            : concatenation {
                : text_part {
                    label = "Z: ";
                }
                : text_part {
                    key = "vtar_z";
                    width = 10;
                }
            }
        }
        : column {
            : text {
                key = "direction";
                width = 15;
            } 
            : concatenation {
                : text_part {
                    label = "X: ";
                }
                : text_part {
                    key = "vdir_x";
                    width = 10;
                }
            }
            : concatenation {
                : text_part {
                    label = "Y: ";
                }
                : text_part {
                    key = "vdir_y";
                    width = 10;
                }
            }
            : concatenation {
                : text_part {
                    label = "Z: ";
                }
                : text_part {
                    key = "vdir_z";
                    width = 10;
                }
            }
        }
    }
    spacer_1;
    : row {
        children_fixed_width = true;
        : column {
            : row {
                : column {
                    : text {
                        label = "Perspective:";
                    }
                    : text {
                        label = "Front Clipping:";
                    }
                    : text {
                        label = "Back Clipping:";
                    }
                }
                : column {
                    : text {
                        key = "persp";
                        width = 4;
                    }
                    : text {
                        key = "fclipon";
                        width = 4;
                    }
                    : text {
                        key = "bclipon";
                        width = 4;
                    }
                }
            }
        }
        : column {
            children_fixed_width = true;
            : row {
                : column {
                    : text {
                        label = "Lens Length:";
                    }
                    : text {
                        label = "Offset:";
                    }
                    : text {
                        label = "Offset:";
                    }
                }
                : column {
                    : text {
                        key = "lens";
                        width = 8;
                    }
                    : text {
                        key = "fclip";
                        width = 8;
                    }
                    : text {
                        key = "bclip";
                        width = 8;
                    }
                }
            }
        }
    }
    spacer_1;
    ok_only;
}



/* debug setting */
/*dcl_settings : default_dcl_settings { audit_level = 2;}
*/

/* New available ID for Language is 149 */

/* prototypes for ok... buttons */

my_ok_button : column {
        :ok_button
        {
          /* LANGID 1 */
          label = "  OK  ";
        }
}


my_cancel_button : column {
        :cancel_button
        {
          /* LANGID 2 */
          label = "Cancel";
        }
}

my_about_button :retirement_button {
            /* LANGID 3 */
            label = "About";
            key="about_button";
}

my_yes_button : retirement_button {
        /* LANGID 4 */
        label = "  YES  ";
        key   = "yes";
        is_default = true;
}

my_no_button : retirement_button {
        /* LANGID 5 */
        label = "  NO  ";
        key   = "no";
}


my_close_button :column {
        :ok_button
        {
          /* LANGID 6 */
          label = "Close";
        }

}


my_help_button :column {
        :help_button
        {
          /* LANGID 7 */
          label = "Help";
        }

}
 

my_ok_only : column {
    fixed_width = true;
    alignment = centered;
    :my_ok_button {
        is_cancel = true;
    }
}


my_close_help :column {
    : row {
        fixed_width = true;
        alignment = centered;
        my_close_button;
        : spacer { width = 2; }
        my_help_button;
        
    }
}

my_ok_cancel_help : column {
    : row {
        fixed_width = true;
        alignment = centered;
        my_ok_button;
        : spacer { width = 2; }
        my_cancel_button;
        : spacer { width = 2; }
        my_help_button;
    }
}

my_ok_cancel_about_help : column {
    :row {
        my_ok_button;
        : spacer { width = 2; }
        my_cancel_button;
        : spacer { width = 2; }
        my_help_button;
        : spacer { width = 2; }
        my_about_button;
    }
}

my_ok_cancel : column {
    : row {
        fixed_width = true;
        alignment = centered;
        my_ok_button;
        : spacer { width = 2; }
        my_cancel_button;
    }
}



my_yes_no_cancel : column {
    : row {
        fixed_width = true;
        alignment = centered;
        my_yes_button;
        : spacer { width = 2; }
        my_no_button;
        : spacer { width = 2; }
        my_cancel_button;
        : spacer { width = 2; }
        my_help_button;
    }
}


/* main interface screens */

ocemain : dialog 
{
    /* LANGID 8 */
    label = "Océ Configuration Manager";
    :column 
    {
    	children_alignment=top;          
        :boxed_column 
        {
            /* LANGID 17 */
            label = "Settings:";
            key="settings_set";
            :row	 
            {
			  	spacer_1;
		        :column
				{
                    :toggle 
    	            {
    	                key = "rcf_toggle";
    	                /* LANGID 126 */
    	                label = "Remote control header";
    	                value = "0";
    	            }
	                :boxed_column 
	                {
	                	fixed_width = true;
	                    fixed_height = true;
                        /* LANGID 18 */
                        label = "C&opies";
	                    key="copies_set";
						:row 
						{
                            :spacer{width=4;}          
	                     	:edit_box 
	                     	{
	                       		key = "copies";
	                       		edit_width = 3;
	                       		edit_limit = 3;
	                       		value = "1";
	                       		alignment = centered;
	                     	}
                            :spacer{width=6;}          

						}
						spacer_1;
	            	}
	                :boxed_radio_column 
	                {
	                	key = "color_mode_radio";
	                    fixed_width = true;
                        /* LANGID 136 */
                        label = "P&lot colors";
	                    value = "color";
	                    :radio_button 
	                    {
                            /* LANGID 20 */
                            label = "Color";
	                        key  = "color";
	                    }
	                    :radio_button 
	                    {
                            /* LANGID 134 */
                            label = "Grayscale ";
	                        key  = "grey_scale";
	                    }
	                    :radio_button 
	                    {
                            /* LANGID 135 */
                            label = "Black and White";
	                        key  = "monochrome";
	                    }
	             	}
			 	}
	            :column 
	            {
	           		:boxed_radio_column  
	           		{
                        /* LANGID 22 */
                        label="Media sa&ver";
	                   	key="media_saver_radio";                   
	                   	value="bypass_radio";
	                   	:radio_button 
	                   	{
	                     	key="bypass_radio";
                            /* LANGID 23 */
                            label="bypass";
	                   	}  
	                   	:radio_button 
	                   	{
	                     	key="machine_radio";
                            /* LANGID 24 */
                            label="machine mode";
	                   	}  
	               	}
	               	spacer_1;
	               	:boxed_column 
	               	{
                        /* LANGID 25 */
                        label="Plot &quality";
	                   	key="quality_set";
	                   	:popup_list 
	                   	{
	                    	key="quality_list";
	                   	}
	                   	spacer_1;
	               	}
	               	spacer_1;
	               	:boxed_column 
	               	{
    	               	:toggle 
    	               	{
    	               		key = "poster_toggle";
                            /* LANGID 148 */
                            label = "Poster mode";
    	                   	value = "0";
    	               	}
    		           	spacer_1;
    	               	:toggle 
    	               	{
    	               		key = "longplot_toggle";
                            /* LANGID 26 */
                            label = "Long plot mode";
    	                   	value = "0";
    	               	}
	               	    spacer_1;
		           	}
		           	spacer_1;
	          	}
	            spacer_1;
	            spacer_1;
		    	:column 
		    	{
	        	    fixed_height=true;
		            children_alignment=centered;
			  	    spacer_1;
		            :button 
		            {
		            	key = "pens_button";
                        /* LANGID 27 */
                        label = "P&ens...";
		            }
			  	    spacer_1;
		            :button 
		            {
		               	key = "transform_button";
                        /* LANGID 28 */
                        label = "&Transform...";
		            }
			  	    spacer_1;
		            :button 
		            {
		               	key = "finishing_button";
                        /* LANGID 29 */
                        label = "&Finishing...";
		           	}
			  	    spacer_1;
		            :button 
		            {
		            	key = "media_button";
                        /* LANGID 30 */
                        label = "&Media...";
		            } 
			  	    spacer_1;
		            :button 
		            {
		             	key = "labeling_button";
                        /* LANGID 31 */
                        label = "&Labeling...";
		            }
			  	    spacer_1;
		            :button 
		            {
		              	key = "stamping_button";
                        /* LANGID 32 */
                        label = "&Stamping...";
		      	    }    
			  	    spacer_1;
		        }
			}
		    spacer_1;
		}
	}
    :column 
    {
        :row 
        {
               	my_ok_cancel_about_help;  
        }
  	}
}
     

save_as : dialog {
     /* LANGID 33 */
     label = "Save as";
     fixed_width=true;
     initial_focus="save_edit";
     :text {
        width = 45;
        key="save_as_text";
     }
     :edit_box {
        edit_with = 45;
        edit_limit = 40;
        key="save_edit"; 
        allow_accept=true;
     }

     :boxed_row {
        my_ok_cancel_help;
     }

}

import_as : dialog {
     /* LANGID 34 */
     label = "Import as";
     fixed_width=true;
     initial_focus="save_edit";
     :text {
        width = 45;
        key="save_as_text";
     }
     :edit_box {
        edit_with = 45;
        edit_limit = 40;
        key="save_edit"; 
        allow_accept=true;
     }

     :boxed_row {
        my_ok_cancel_help;
     }

}

ok_cancel_show : dialog {
  /* LANGID 35 */
  label="Dialog";
  :text {
    key = "ok_cancel_show_text1";
    width = 50;
  }
  :text {
    key = "ok_cancel_show_text2";
    width = 50;
  }
  my_ok_cancel_help; 
}


yes_no_cancel_show : dialog {
  /* LANGID 36 */
  label="Dialog";
  :text {
    key = "yes_no_cancel_show_text1";
    width = 50;
  }
  :text {
    key = "yes_no_cancel_show_text2";
    width = 50;
  }
  my_yes_no_cancel;
}

about_screen : dialog {
    children_alignment=centered;
    fixed_width=true;
    /* LANGID 37 */
    label="About";
    :text {
      key = "title1_text";
      width=35;
    }
    :text {
      key = "title2_text";
    }
    :text {
      key = "version_text";
    }
    :text {
      key = "copyright_text";
    }
    spacer_1;
    my_ok_button;

}


error : dialog {
  :text {
    key = "error_text";
    width = 80;
  }

  my_ok_only;
}

transform : dialog {
        /* LANGID 38 */
        label = "Transformation";
        :column{
         spacer_1;
         :boxed_radio_row {
           key="rotation_radio";
           /* LANGID 39 */
           label="&Rotation (counter clockwise):";
           value="zero_degree";
           :radio_button {
              key="zero_degree";
              /* LANGID 40 */
              label="0";
           }
           :radio_button {
              key="90_degree";
              /* LANGID 41 */
              label="90";
           }
           :radio_button {
              key="180_degree";
              /* LANGID 42 */
              label="180";
           }
           :radio_button {
              key="270_degree";
              /* LANGID 43 */
              label="270";
           }
           :radio_button {
              key="productive";
              /* LANGID 44 */
              label="Productive";
           }
           :radio_button {
              key="folding";
              /* LANGID 45 */
              label="Folding";
           }
         }
        spacer_1;
        :row {
         fixed_width = true;
            :boxed_column {
               fixed_width=true;
               /* LANGID 46 */
               label="&Origin";
               key="origin_set";
               :popup_list {
                   key="origin_list";
                   edit_width=12;        

               }
               spacer_1;
            }
            :boxed_column {
               /* LANGID 47 */
               label = "&Mirror";
               key="mirror_set";
               :popup_list {
                   key = "mirror_list";
                   edit_width = 12; 
               }
               spacer_1;
            }
        }
        spacer_1;
        :boxed_column {
         /* LANGID 48 */
         label="&Scaling";
         key="scaling_set";
         :row {
            :popup_list {
               key="scaling_list";
               edit_width = 20;
            }
            spacer_1;
            :edit_box {
               key = "xscale";
               /* LANGID 49 */
               label = "X:";
               edit_width = 5;
               edit_limit = 6;
            }
            :text {
               /* LANGID 50 */
               label = "%";
               key = "scalextext";
            }
            :edit_box {
               key = "yscale";
               /* LANGID 51 */
               label = "Y:";
               edit_width = 5;
               edit_limit = 6;
            }
            :text {
               /* LANGID 52 */
               label = "%";
               key = "scaleytext";
            }
          }
          spacer_1;
        }
        spacer_1;
        :toggle {
          key="scale_pen_toggle";
          /* LANGID 53 */
          label="Scale &pen widths";
          value="0";
        }
        spacer_1;
        :boxed_row {
          my_ok_cancel_help;
          
        }
       }
}

/* MONOCHROME pens_mono */
pens_mono : dialog {
             /* LANGID 54 */
             label = "Pens (monochrome mode only)";
             :column{
               spacer_1;
               :boxed_column {
                  :row {
                    :text {
                     /* LANGID 55 */
                     label="Pen"; /*8*/
                     key="pen_text";
                     width=16;
                    }
                    :text {
                     /* LANGID 56 */
                     label="Pattern"; /*9*/
                     key="pattern_text";
                     width=9;
                    }
                    :text {
                     /* LANGID 57 */
                     label="Status"; /*9*/
                     key="status_text";
                     width=9;
                    }
                    :text {
                     /* LANGID 58 */
                     label="Transp."; /*9*/
                     key="transp_text";
                     width=9;
                    }
                  }
                  :list_box {
                     key="pen_list";
                     multiple_select=false;
                     tabs="1 14 25 36 45";
                     fixed_width=true;
                     width=56;
                     fixed_height=true;
                     height=7;
                  }
                  :row {
                    :column {
                      :edit_box {
                        key="from_edit";
                        /* LANGID 60 */
                        label="&From:";
                        edit_width=3;
                        edit_limit=3;
                      }
                      :edit_box {
                        key="to_edit";
                        /* LANGID 61 */
                        label="&To:";
                        edit_width=3;
                        edit_limit=3;
                      }

                    }
                    :popup_list {
                        key="pattern_list";
                        edit_width=5;
                    }
                    :popup_list {
                        key="status_list";
                        edit_width=10;
                    }
                    :popup_list {
                        key="transparency_list";
                    }
                  }
                  spacer_1;
                  :row {
                    :button {
                        key="insert_button";
                        /* LANGID 62 */
                        label="&Insert"; 
                    }
                    :button {
                        key="remove_button";
                        /* LANGID 63 */
                        label="&Remove"; 
                    }
                  }
                  spacer_1;
                }
              }
              :boxed_radio_row {
                   key = "transparency";
                   fixed_width = true;
                   /* LANGID 137 */
                   label = "C&olor merge control";
                   value = "overlay";
                   :radio_button {
                       /* LANGID 138 */
                       label = "Overlay";
                       key  = "overlay";
                   }
                   :radio_button {
                       /* LANGID 139 */
                       label = "Merge";
                       key  = "merge";
                   }
              }
              spacer_0;
              :boxed_row {
               my_ok_cancel_help;

              }
            
}

/* COLOR */
pens_color : dialog {
             /* LANGID 67 */
             label = "Pens  (color mode only)";
             :column{
              :boxed_column {
                  :row {
                    :text {
                     /* LANGID 68 */
                     label="Pen"; /*8*/
                     key="pen_text";
                     width=15;
                    }
                    :text {
                     /* LANGID 69 */
                     label="Color"; /*9*/
                     key="color_text";
                     width=16;
                    }
                    :text {
                     /* LANGID 70 */
                     label="Transp."; /*9*/
                     key="transp_text";
                     width=8;
                    }
                  }
                  :list_box {
                     key="pen_list";
                     multiple_select=false;
                     tabs="1 15 26 37";
                     fixed_width=true;
                     width=49;
                     fixed_height=true;
                     height=7;
                  }
                  :row {
                    :column {
                        fixed_width=true;
                      :edit_box {
                        key="from_edit";
                        /* LANGID 72 */
                        label="&From:";
                        edit_width=3;
                        edit_limit=3;
                      }
                      :edit_box {
                        key="to_edit";
                        /* LANGID 73 */
                        label="&To:";
                        edit_width=3;
                        edit_limit=3;
                      }

                    }
					:column {
                    	:button {
                        	key="color_button";
                        	/* LANGID 140 */
                        	label="&Color"; 
                    	}
						:image {
		        			key = "cur_color";
		        			height = 1;
							width = 10;
	            		}
					}
                    spacer_1;
                    :popup_list {
                        key="transparency_list";
                    }
                  }
                  spacer_1;
                  :row {
                    :button {
                        key="insert_button";
                        /* LANGID 74 */
                        label="&Insert"; 
                    }
                    :button {
                        key="remove_button";
                        /* LANGID 75 */
                        label="&Remove"; 
                    }
                  }
                  spacer_1;
                }
               :row {   
               :boxed_radio_row {
                   key = "transparency";
                   fixed_width = true;
                   /* LANGID 137 */
                   label = "C&olor merge control";
                   value = "overlay";
                   :radio_button {
                       /* LANGID 138 */
                       label = "Overlay";
                       key  = "overlay";
                   }
                   :radio_button {
                       /* LANGID 139 */
                       label = "Merge";
                       key  = "merge";
                   }
               }
              }
              spacer_0;
              :boxed_row {
               my_ok_cancel_help;

              }
            }
    
}

labeling : dialog {
            /* LANGID 82 */
            label="Labeling";
            :column {       
              spacer_1;
              :boxed_row {
                :toggle {
                 key="labeling_toggle";
                 /* LANGID 83 */
                 label="&Add plot label";
                 value="0";
                }
              }
              spacer_1;
              :boxed_column {             
                key="composed_column";
                /* LANGID 84 */
                label="&Composed of";
                :toggle {
                   key="name_toggle";
                   /* LANGID 85 */
                   label="Drawing name";
                }
                :toggle {
                   key="time_toggle";
                   /* LANGID 86 */
                   label="Time";
                }
                :edit_box {
                   key="comment_edit";
                   /* LANGID 87 */
                   label="Comment:";
                   edit_width=20;
                   edit_limit=20;
                   fixed_width=true;
                }
                spacer_1;
              }
              :boxed_row {
               my_ok_cancel_help;

              }

             }
}

ocemedia : dialog 
{
    /* LANGID 88 */
    label="Media";
    :column 
    {
        children_fixed_width=true;
        spacer_1;
        :row
        {
            :popup_list 
            {
                key="format_list";
                /* LANGID 89 */
                label="&Paper format:";
                edit_width=11;
            }
            spacer_1;
            spacer_1;
            :toggle 
            {
                key="media_auto_toggle";
                /* LANGID 128 */
                label="Auto";
            }
        }
        spacer_1;
       :popup_list 
        {
            key="media_list";
            /* LANGID 90 */
            label="&Media type:";
            edit_width=12;
        }
        spacer_1;
        :popup_list 
        {
            key="feed_list";
            /* LANGID 91 */
            label="Paper &feed:";
            edit_width=12;
        }
        spacer_1;
        :popup_list 
        {
            key="rollover_list";
            /* LANGID 92 */
            label="&If exact format unavailable:";
            edit_width=17;
        }
        spacer_1;
    }
    :boxed_row 
    {
        my_ok_cancel_help;
    }
} 


finishing : dialog 
{
    /* LANGID 93 */
    label="Finishing";
    :row 
    {
        children_alignment=top;
        :boxed_radio_row 
        {
            key="folding_radio";
            /* LANGID 141 */
            label="&Folding";
            value="no_folding";
            :radio_button 
            {
                key="no_folding";
                /* LANGID 142 */
                label="None";
            }
            :radio_button 
            {
                key="full_folding";
                /* LANGID 143 */
                label="Full";
            }
            :radio_button 
            {
                key="first_fold_only";
                /* LANGID 144 */
                label="First fold only";
            }
        }
		:boxed_column 
		{
			/* LANGID 146 */
			label="P&unching";
			:toggle 
			{
				key="punching_toggle";
				/* LANGID 147 */
				label="Punching";
			}
		}
		:boxed_column 
		{
			/* LANGID 97 */
			label="Folding &method";
			key="method_set";
			:popup_list 
			{
				key="method_list";
			}
			spacer_1;
		}
    }
    :row 
    {
        children_alignment=top;
        :boxed_column 
        {
            /* LANGID 98 */
            label="&Binding edge";
            key="binding_edge_set";

            :row
            {
                :toggle 
                {
                    key="binding_edge_toggle";
                    /* LANGID 99 */
                    label="&activate";
                    value="0";
                }
                :edit_box 
                {
                    fixed_width=true;
                    /* LANGID 127 */
    		        label=" ";
                    key="binding_edge_edit";
                    edit_width=6;
                    edit_limit=6;
                }
                :text_part 
                {
    		        key="binding_edge_unit_text";
    			    width=3;
    			    value="mm";
    		    }  
            }
			spacer_1;
        }
        :boxed_column 
        {
            fixed_height=true;
            key="orientation_set";
            /* LANGID 100 */
            label="Fold &orientation";
            :popup_list 
            {
                key="orientation_list";
            } 
            spacer_1;
        }             
    }
    :boxed_column 
    {
        /* LANGID 101 */
        label="Fold &packet";
        key="folding_lw_set";
        :column 
        {
	        :row 
	        {
	            :edit_box 
	            {
	                key="fold_length_edit";
                    /* LANGID 102 */
                    label="Length:";
	                edit_limit=6;
	                edit_width=6;
	            }
	            :text_part 
	            {
				    key="fold_length_unit_text";
				    value="inch";
			    }
		        spacer_1;
	            :edit_box 
	            {
	                key="fold_width_edit";
                    /* LANGID 103 */
                    label="Width:";
	                edit_limit=6;
	                edit_width=6;
	            }
	            :text_part 
	            {
				    key="fold_width_unit_text";
				    value="inch";
			    }
		    }
        }
        spacer_1;
    }
    :row 
    {
        :boxed_column 
        {
            /* LANGID 104 */
            label="&Delivery";
            key="deposit_set";

            :row
            {
                :popup_list
                {
                    key="deposit_list";
                    /* LANGID 132 */
                    label="Folded";
                    edit_width=10;
                }
                spacer_1;
                :popup_list
                {
                    key="deposit_unfold_list";
                    /* LANGID 130 */
                    label="Not folded";
                    edit_width=15;
                }
                spacer_1;
                :edit_box 
                {
                    key="bin_edit";
                    /* LANGID 131 */
                    label="Bin";
                    edit_limit=2;
                    edit_width=2;
                }
            }
            spacer_1;
        }
    }
    :row
    {
        :boxed_column 
        {
            /* LANGID 106 */
            label="&Cut on";
            key="cut_set";
            :row
            {
                :popup_list 
                {
                    key="cut_list";
                    edit_width=15;
                }
                spacer_1;
                :edit_box 
                {
                    key="custom_length_edit";
                    /* LANGID 129 */
                    label="Length:";
                    edit_limit=6;
                    edit_width=6;
                }
                :text_part 
                {
        		    key="custom_length_text";
        		    value="mm";
        	    }
            }
            spacer_1;
        }
    }
    spacer_0;
    :boxed_row 
    {
        my_ok_cancel_help;
    }
}

stamping : dialog {
              /* LANGID 107 */
              label="Stamping";
              :boxed_row { 
                :toggle {
                   key="stamping_toggle";
                   /* LANGID 108 */
                   label="&use stamping";
                   value="1";
                }
              }
              spacer_1;
              :popup_list {
                key="stamp_list";
                /* LANGID 109 */
                label="Predefined &string:";
                fixed_width=true;
              }
              spacer_1;
              :boxed_radio_row {
                 key="position_radio";
                 /* LANGID 110 */
                 label="&Position";
                 value="bottom";
                 :radio_button {
                   key="bottom";
                   /* LANGID 111 */
                   label="Bottom";
                 }
                 :radio_button {
                   key="middle";
                   /* LANGID 112 */
                   label="Middle";
                 }
                 :radio_button {
                   key="top";
                   /* LANGID 113 */
                   label="Top";
                 }
              }   
              spacer_1;          
              :boxed_radio_row {
                 key="font_radio";
                 /* LANGID 114 */
                 label="&Font size";
                 value="small";
                 :radio_button {
                   key="small";
                   /* LANGID 115 */
                   label="Small";
                 }
                 :radio_button {
                   key="large";
                   /* LANGID 116 */
                   label="Large";
                 }
              }   
              spacer_1;          
              :boxed_radio_row {
                 key="grayscale_radio";
                 /* LANGID 117 */
                 label="&Grayscale ";
                 value="black";
                 :radio_button {
                   key="black";
                   /* LANGID 118 */
                   label="Black";
                 }
                 :radio_button {
                   key="darkgray";
                   /* LANGID 119 */
                   label="Darkgray";
                 }
                 :radio_button {
                   key="gray";
                   /* LANGID 120 */
                   label="Gray";
                 }
                 :radio_button {
                   key="lightgray";
                   /* LANGID 121 */
                   label="Lightgray";
                 }
              }   
              

              spacer_1;
              :boxed_row {
                 my_ok_cancel_help;
              }

}

