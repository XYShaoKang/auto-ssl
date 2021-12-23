# SSL 证书自动化处理

基于 Let’s Encrypt,提供自动化 SSL 证书的申请和安装,目前支持的场景:

1. 使用阿里云 OSS 的静态网页服务
2. 在本地使用 NGINC 提供网页服务

## 快速使用

### 下载安装

```sh
git clone https://github.com/XYShaoKang/auto-ssl.git
cd auto-ssl
pnpm install && pnpm build
```

### 配置

将`config.example.json`重命名为`config.json`,根据自己的实际情况进行配置.

配置使用一个 JSON 来编写,最外边是一个数组,里面每一项对应的是每个需要申请证书的配置

- domains: 字符串,为必填项,需要申请证书的域名列表
- commonName: 字符串,可选项,如果没有,则会取 `domains[0]` 作为 commonName
- expireTimeThreshold: 数字,可选项,过期时间阈值(单位: 天),默认为 15,只对剩余过期时间小于阈值的域名进行更新
- server: 服务配置,可以分为本地服务(NGINC),线上服务(OSS),查看后面详细说明

```json
[
  {
    "domains": ["example.com"],
    "commonName": "example.com",
    "expireTimeThreshold": 15,
    "server": {}
  }
]
```

#### 使用 OSS 服务的场景

先决条件: 在 CDN 中添加域名,并将域名指向 Bucket.

> 使用 CDN 并不是申请证书必须的,Bucket 自身可以绑定域名并添加 SSL 证书,只是没有对应的 API 接口能操作,所以申请好证书之后,需要手动添加证书,如果要实现自动化,则可以通过在 CDN 中添加域名,再指向 Bucket,这样就可以通过 CDN 的 API 为域名设置证书了,将整个过程自动化
>
> 第一次,需要手动到 CDN 中开启 HTTPS 设置,之后就可以全自动续签和更新了

accessKeyId 需要权限:

- AliyunOSSFullAccess
- AliyunCDNFullAccess
- [ ] AliyunYundunCertReadOnlyAccess 用于证书的备份还原时获取 key

将 useOSS 设置为 true,另外在 `oss` 字段下添加以下数据:

- useOSS: true,必填,表示使用 OSS 服务
- region: 字符串,Bucket 所在地域,比如杭州的值为`oss-cn-hangzhou`,[访问域名和数据中心](https://help.aliyun.com/document_detail/31837.htm)
- accessKeyId: 字符串,有权限的 accessKeyId 和 accessKeySecret
- accessKeySecret: 字符串
- bucket: 字符串,域名所指向的 Bucket 的名称

```json
[
  {
    "domains": ["example.com"],
    "commonName": "example.com",
    "server": {
      "useOSS": true,
      "region": "oss-cn-hangzhou",
      "accessKeyId": "xxx",
      "accessKeySecret": "xxx",
      "bucket": "example"
    }
  }
]
```

#### 使用 NGINC 的场景

先决条件: 本地能提供 http 服务,外网能通过域名 + 80 端口访问,并配置好 SSL 证书

> 第一次可以等获取好证书之后在进行 SSL 证书相关的配置,或者直接先配置好也可以,等获取好证书直接就可以用了.
>
> 在成功获取到证书之后,会执行 `systemctl reload nginx` 的命令重新加载配置,如果提前配置好,应该是可以在浏览器看到最新的证书日期.

将 useOSS 设置为 false,另外在 `local` 字段下添加以下数据:

- useOSS: false,必填,表示使用 NGINX
- webRoot: 网站的根目录
- certPath: 证书存放的路径,会将申请证书的密钥(例: `example.com.key`)以及申请到的证书(例: `example.com.pem`)存放到这个路径下

```json
[
  {
    "domains": ["example.com"],
    "commonName": "example.com",
    "server": {
      "useOSS": false,
      "webRoot": "/usr/share/nginx/example.com/",
      "certPath": "/etc/ssl/website/"
    }
  }
]
```

- 查看完整的例子 [config.example.json](./config.example.json)

### 运行

配置好之后,通过以下命令运行:

```sh
# 在开发模式下运行,使用 Let’s Encrypt 的测试环境运行
pnpm dev
# 在生产模式下运行,使用 Let’s Encrypt 的生产环境运行
pnpm start
```

> 在 Let’s Encrypt 的生产环境下,需要注意[速率限制](https://letsencrypt.org/zh-cn/docs/rate-limits/)的问题

## 目录结构

```
├── .vscode
├── account ----------------------------- 存放账户信息
├── log --------------------------------- 存放日志
├── node_modules
├── package.json
├── pnpm-lock.yaml
├── src --------------------------------- 主要代码
│   ├── cdn.ts -------------------------- CDN 操作模块
│   ├── config.example.json ------------- 配置示例
│   ├── config.json --------------------- 配置文件
│   ├── createConfig.ts ----------------- 读取验证以及添加处理函数
│   ├── index.ts ------------------------ 执行入口
│   ├── oss.ts -------------------------- OSS 操作模块
│   └── utils.ts ------------------------ 辅助函数
├── .eslintrc.js
├── .gitignore
├── .prettierrc.js
├── README.md
└── tsconfig.json
```

## 参考

- Let’s Encrypt
  - [Let’s Encrypt: an automated certificate authority to encrypt the entire web](https://blog.acolyer.org/2020/02/12/lets-encrypt-an-automated-certificate-authority-to-encrypt-the-entire-web/)
  - [Enabling free wildcard domain certificates with Let's Encrypt](https://www.netlify.com/blog/2018/08/20/enabling-free-wildcard-domain-certificates-with-lets-encrypt/)
  - [letsencrypt 的 ACME 规范开发折腾记](https://zhuanlan.zhihu.com/p/73981808)
  - [SSL 数字证书的标准、编码以及文件扩展名](https://kangzubin.com/certificate-format/)
- Automatic Certificate Management Environment (ACME)
  - [ACME 规范](https://datatracker.ietf.org/doc/html/rfc8555)
  - [ACME 客户端](https://letsencrypt.org/zh-cn/docs/client-options/)
  - [node-acme-client](https://github.com/publishlab/node-acme-client)
- 阿里云 OSS
  - [快速入门](https://help.aliyun.com/document_detail/31823.html)
  - [开发指南](https://help.aliyun.com/document_detail/32067.html)
  - [Node.js SDK](https://help.aliyun.com/document_detail/32067.html)
    - [ali-oss](https://github.com/ali-sdk/ali-oss?spm=a2c4g.11186623.0.0.1399110aA6KgYL)
  - [API 参考](https://help.aliyun.com/document_detail/31947.html)
- 阿里云 CDN
  - [OpenAPI @alicloud/cdn20180510](https://next.api.aliyun.com/api-tools/sdk/Cdn?version=2018-05-10&language=nodejs-tea)
  - [快速入门](https://help.aliyun.com/document_detail/27111.html)
  - [新版 API 参考](https://help.aliyun.com/document_detail/91036.html)
