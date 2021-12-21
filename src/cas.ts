import Cas20180713, * as $Cas20180713 from '@alicloud/cas20180713'
import * as $OpenApi from '@alicloud/openapi-client'
import { log } from './utils'

function createClient(accessKeyId: string, accessKeySecret: string) {
  const config = new $OpenApi.Config({
    accessKeyId: accessKeyId,
    accessKeySecret: accessKeySecret,
  })

  config.endpoint = 'cas.aliyuncs.com'
  return new Cas20180713(config)
}

const getCasClient = (() => {
  const cache = new Map<string, Cas20180713>()
  return (accessKeyId: string, accessKeySecret: string) => {
    let client = cache.get(accessKeyId)
    if (!client) {
      client = createClient(accessKeyId, accessKeySecret)
      cache.set(accessKeyId, client)
    }
    return client
  }
})()

async function getCertKey(accessKeyId: string, accessKeySecret: string, certId: number) {
  const client = getCasClient(accessKeyId, accessKeySecret)
  const request = new $Cas20180713.DescribeUserCertificateDetailRequest({ certId })
  const response = await client.describeUserCertificateDetail(request)
  log.info('CAS: 获取 key 成功')
  log.debug(JSON.stringify(response.body))
  return response
}

export { getCertKey }
