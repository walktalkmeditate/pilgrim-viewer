import './style.css'
import { createDropZone } from './ui/dropzone'

const app = document.getElementById('app')!

createDropZone(app, async (name, buffer) => {
  console.log('File received:', name, buffer.byteLength, 'bytes')
})
