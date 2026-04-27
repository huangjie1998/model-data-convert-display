export class SceneNode {
  constructor(type = 'Group') {
    this.type = type;
    this.children = [];
    this.visible = true;
    this.frustumCulled = false;
    this.renderOrder = 1;
    this.geometry = undefined;
    this.material = undefined;
    this.userData = {};
  }

  add(child) {
    if (!child) return;
    this.children.push(child);
  }

  clear() {
    this.children = [];
  }

  traverse(visitor) {
    if (typeof visitor !== 'function') return;
    visitor(this);
    for (let i = 0; i < this.children.length; i += 1) {
      const child = this.children[i];
      if (child && typeof child.traverse === 'function') {
        child.traverse(visitor);
      } else if (child) {
        visitor(child);
      }
    }
  }
}
