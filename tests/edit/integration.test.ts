// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import JSZip from 'jszip'
import { parsePilgrim } from '../../src/parsers/pilgrim'
import { serializeTendedPilgrim } from '../../src/edit/save'
import type { Modification } from '../../src/parsers/types'

const KUMANO_PATH = resolve(__dirname, '../../samples/kumano-kodo.pilgrim')

function mkMod(op: Modification['op'], payload: unknown, walkId?: string): Modification {
  return { id: `m-${Math.random()}`, at: Date.now(), op, walkId, payload: payload as Modification['payload'] }
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return new Uint8Array(buffer).buffer
}

describe('integration — open, tend, save, re-parse', () => {
  it('archives a walk, edits an intention, saves, and the result re-parses cleanly', async () => {
    const nodeBuf = readFileSync(KUMANO_PATH)
    const buf = bufferToArrayBuffer(nodeBuf)
    const original = await parsePilgrim(buf)
    expect(original.walks.length).toBeGreaterThan(1)
    const targetId = original.walks[0].id
    const editId = original.walks[1].id

    const result = await serializeTendedPilgrim({
      originalBuffer: buf,
      manifest: original.manifest,
      rawWalks: original.rawWalks,
      modifications: [
        mkMod('archive_walk', {}, targetId),
        mkMod('edit_intention', { text: 'fresh start' }, editId),
      ],
      includeHistory: true,
      originalFilename: 'kumano-kodo.pilgrim',
    })

    const reZip = await JSZip.loadAsync(result.blob)
    const reBuf = await reZip.generateAsync({ type: 'arraybuffer' })
    const reParsed = await parsePilgrim(reBuf)

    expect(reParsed.walks.length).toBe(original.walks.length - 1)
    expect(reParsed.manifest.archivedCount).toBe(1)
    expect(reParsed.manifest.archived![0].id).toBe(targetId)

    const editedWalk = reParsed.walks.find(w => w.id === editId)
    expect(editedWalk).toBeDefined()
    expect(editedWalk!.intention).toBe('fresh start')

    expect(reParsed.manifest.modifications!.length).toBeGreaterThanOrEqual(2)
  })

  it('tend-a-tended-file: cumulative modifications log', async () => {
    const nodeBuf = readFileSync(KUMANO_PATH)
    const buf = bufferToArrayBuffer(nodeBuf)
    const first = await parsePilgrim(buf)

    const r1 = await serializeTendedPilgrim({
      originalBuffer: buf,
      manifest: first.manifest,
      rawWalks: first.rawWalks,
      modifications: [mkMod('edit_intention', { text: 'pass 1' }, first.walks[0].id)],
      includeHistory: true,
      originalFilename: 'kumano-kodo.pilgrim',
    })

    const zip2 = await JSZip.loadAsync(r1.blob)
    const buf2 = await zip2.generateAsync({ type: 'arraybuffer' })
    const second = await parsePilgrim(buf2)

    const r2 = await serializeTendedPilgrim({
      originalBuffer: buf2,
      manifest: second.manifest,
      rawWalks: second.rawWalks,
      modifications: [mkMod('edit_intention', { text: 'pass 2' }, second.walks[0].id)],
      includeHistory: true,
      originalFilename: 'kumano-kodo-tended.pilgrim',
    })

    const zip3 = await JSZip.loadAsync(r2.blob)
    const buf3 = await zip3.generateAsync({ type: 'arraybuffer' })
    const third = await parsePilgrim(buf3)

    expect(third.manifest.modifications!.length).toBeGreaterThanOrEqual(2)
    expect(third.walks[0].intention).toBe('pass 2')
  })
})
