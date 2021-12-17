import Cdn20180510, * as $Cdn20180510 from '@alicloud/cdn20180510'
import * as $OpenApi from '@alicloud/openapi-client'
import { log } from './utils'

function createClient(accessKeyId: string, accessKeySecret: string) {
  const config = new $OpenApi.Config({
    accessKeyId: accessKeyId,
    accessKeySecret: accessKeySecret,
  })

  config.endpoint = 'cdn.aliyuncs.com'
  return new Cdn20180510(config)
}

type Option = {
  accessKeyId: string
  accessKeySecret: string
  domainName: string
  serverCertificate: string
  privateKey: string
}

async function setCertificate({ accessKeyId, accessKeySecret, domainName, serverCertificate, privateKey }: Option) {
  const client = createClient(accessKeyId, accessKeySecret)
  const request = new $Cdn20180510.SetDomainServerCertificateRequest({})
  request.domainName = domainName
  request.serverCertificateStatus = 'on'
  request.certType = 'upload'
  request.serverCertificate = serverCertificate
  request.privateKey = privateKey
  try {
    const response = await client.setDomainServerCertificate(request)
    log.info('设置加速域名的证书信息成功')
    log.debug(JSON.stringify(response.body))
  } catch (error) {
    log.warn((error as any).message)
  }
}

export { setCertificate }
