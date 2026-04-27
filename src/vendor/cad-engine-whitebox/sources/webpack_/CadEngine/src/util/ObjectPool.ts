export class ObjectPool<T extends { release: () => void }> {
  private _constructor: new (...args: any[]) => T;
  private _useObject: T[] = [];
  private _freeObject: T[] = [];
  constructor(constructor: new (...args: any[]) => T) {
    this._constructor = constructor;
  }

  public get(...args: any[]): T {
    const object = this._freeObject.length > 0 ? this._freeObject.pop() : new this._constructor(...args);
    this._useObject.push(object);
    return object;
  }

  public release(obj: T): void {
    obj.release();
    this._freeObject.push(obj);
    this._useObject.splice(this._useObject.indexOf(obj), 1);
  }

  public clear(): void {
    this._useObject.forEach((obj) => {
      obj.release();
      this._freeObject.push(obj);
    });
    this._useObject.length = 0;
  }

  public dispose(): void {
    this._useObject.forEach((obj) => {
      obj.release();
    });
    this._useObject.length = 0;
    this._freeObject.length = 0;
    this._constructor = null;
  }
}
