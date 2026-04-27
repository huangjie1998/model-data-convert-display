import { Engine } from './engine/Engine.js';

(function bootstrapCadEngineRuntime(global) {
  if (!global.CadEngine) {
    global.CadEngine = {};
  }

  global.CadEngine.Engine = Engine;
  global.CadEngine.__provider = 'cad_runtime';
})(window);
