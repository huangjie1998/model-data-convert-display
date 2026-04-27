import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import {
    IDictionary,
} from './Types'
import { GlxLoader } from "@/core/plugins/GlxLoader";

export function createFilesMap(files) {
    const map = {};
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        map[file.name] = file;
    }
    return map;
}

export interface Files {
    files: File[];
    filesMap: IDictionary<File>
}

export async function getFilesFromItemList(items): Promise<Files> {
    return new Promise(resolve => {

        let itemsCount = 0
        let itemsTotal = 0
    
        const files = []
        const filesMap = {}
    
        function onEntryHandled() {
            itemsCount++
    
            if (itemsCount === itemsTotal) {
                resolve({files, filesMap})
            }
        }

        function handleEntry(entry) {
            if (entry.isDirectory) {
                const reader = entry.createReader()
                reader.readEntries(entries => {
                    for (let i = 0; i < entries.length; i++) {
                        handleEntry(entries[i])
                    }
                    onEntryHandled()
                })
            } else if (entry.isFile) {
                entry.file(file => {
                    files.push(file)
                    filesMap[entry.fullPath.substr(1)] = file
                    onEntryHandled()
                })
            }

            itemsTotal++
        }

        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                handleEntry(items[i].webkitGetAsEntry())
            }
        }
    })
}

export async function loadItemList(items) {
    const {files, filesMap} = await getFilesFromItemList(items)
    return loadFiles(files, filesMap)
}

export async function loadFiles(files, filesMap = createFilesMap(files)) {
    const manager = new LoadingManager()
    manager.setURLModifier(url => {
        url = url.replace(/^(\.?\/)/, '') // remove './'
        const file = filesMap[url]
        if (file) {
            return URL.createObjectURL(file)
        }

        return url
    })

    const result = []
    for (let i = 0; i < files.length; i++) {
        const scene = await loadFile(files[i], manager);
        if (scene) {
            result.push(scene)
        }
    }

    return result
}

export async function loadFile(file, manager) {
    const filename = file.name
    const extension = filename.split('.').pop().toLowerCase()

    return new Promise(resolve => {

        const reader = new FileReader()
        reader.addEventListener( 'progress', function ( event ) {

			const size = '(' + Math.floor( event.total / 1000 ).toString().replace( /(\d)(?=(\d{3})+(?!\d))/g, '$1,' ) + ' KB)';
			const progress = Math.floor( ( event.loaded / event.total ) * 100 ) + '%';

			console.log( 'Loading', filename, size, progress );

		} );
        switch(extension) {
            case 'glb':
            case 'gltf':
                reader.addEventListener('load', async event => {
                    const contents = event.target.result
                    const loader = new GLTFLoader(manager)
                    loader.parse(contents, '', glTF => {
                        resolve(glTF)
                    })
                })
                reader.readAsArrayBuffer(file)
                break
            case 'glx':
                reader.addEventListener('load', async event => {
                    const contents = event.target.result;
                    const glx = new GlxLoader("",manager);
                    glx.parse(contents,file.name,(glx)=>{
                        resolve(glx)
                    });
                })
                reader.readAsArrayBuffer(file)
                break
            default:
                // console.error('Unsupported file type: ' + extension)
                resolve(null)
                break
            }
    })

}

export function onDragOver(event) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
}

export async function onDrop(event) {
    event.preventDefault()
    if (event.dataTransfer.types[0] === 'text/plain') return
    let glTFs
    if (event.dataTransfer.items) {
      // support folders
      glTFs = await loadItemList(event.dataTransfer.items)
    } else {
      glTFs = await loadFiles(event.dataTransfer.files)
    }

    return glTFs
}