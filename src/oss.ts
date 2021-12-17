import OSS from 'ali-oss'
import { log } from './utils'

interface Option {
  region: string
  accessKeyId: string
  accessKeySecret: string
  bucket: string
}

function createStore({ region, accessKeyId, accessKeySecret, bucket }: Option) {
  return new OSS({
    region,
    accessKeyId,
    accessKeySecret,
    bucket,
  })
}

function checkStore(store: OSS | null): asserts store {
  if (!store) {
    const msg = '请先初始化 store'
    log.error(msg)
    throw new Error(msg)
  }
}

function put(store: OSS | null, path: string, data: Buffer) {
  checkStore(store)
  return store.put(path, data)
}

function deleteFile(store: OSS | null, path: string) {
  checkStore(store)
  return store.delete(path)
}

export { put, deleteFile, createStore }
