const fs = require('fs')
const path = require('path')
const os = require('os')
const util = require('util')
const core = require('@actions/core')
const tc = require('@actions/tool-cache')
const exec = require('@actions/exec').exec

// for more information see:
// https://github.com/Azure/setup-kubectl/blob/master/src/run.ts
// https://github.com/Azure/k8s-set-context/blob/master/src/login.ts
// https://github.com/Azure/k8s-deploy/blob/master/src/run.ts

const KUBECTL_VERSION_FALLBACK = 'v1.15.0'
const KUBECTL_VERSION_STABLE_URL = 'https://storage.googleapis.com/kubernetes-release/release/stable.txt'

const KubectlDownloadUrl = {
  LINUX: 'https://storage.googleapis.com/kubernetes-release/release/%s/bin/linux/amd64/kubectl',
  DARWIN: 'https://storage.googleapis.com/kubernetes-release/release/%s/bin/darwin/amd64/kubectl',
  WINDOWS: 'https://storage.googleapis.com/kubernetes-release/release/%s/bin/windows/amd64/kubectl.exe',
}

const getKubectlExtension = () => /^Win/.test(os.type()) ? '.exe' : ''
const getKubectlLatestVersion = async () => {
  let version
  try {
    const downloadPath = await tc.downloadTool(KUBECTL_VERSION_STABLE_URL)
    version = fs.readFileSync(downloadPath, 'utf8').trim() || KUBECTL_VERSION_FALLBACK
    core.debug(`got latest version of kubectl: ${version}`)

  } catch (error) {
    console.error(error)
    core.warning('failed to get latest version of kubectl')
    version = KUBECTL_VERSION_FALLBACK
  }
  return version
}

const getkubectlDownloadUrl = version => {
  const type = os.type()

  return (
    type === 'Darwin' ? util.format(KubectlDownloadUrl.DARWIN, version) :
    type === 'Windows_NT' ? util.format(KubectlDownloadUrl.WINDOWS, version) :
    util.format(KubectlDownloadUrl.LINUX, version))
}

const getKubectlPath = async (version) => {
  if (version.toLowerCase() === 'latest') {
    core.debug('getting latest version of kubectl')
    version = await getKubectlLatestVersion()
  }
  let kubectlPath
  let cachedPath
  if (!kubectlPath && (cachedPath = tc.find('kubectl', version))) {
    kubectlPath = path.join(cachedPath, `kubectl${getKubectlExtension()}`)
    core.debug(`kubectl version ${version} found in cache at ${cachedPath}`)
  }
  let downloadPath
  if (!kubectlPath && (downloadPath = await tc.downloadTool(getkubectlDownloadUrl(version)))) {
    cachedPath = await tc.cacheFile(downloadPath, `kubectl${getKubectlExtension()}`, 'kubectl', version)
    kubectlPath = path.join(cachedPath, `kubectl${getKubectlExtension()}`)
    core.debug(`kubectl version ${version} has been downloaded and cached at ${cachedPath}`)
  }
  if (!kubectlPath) {
    throw new Error(`Unable to download kubectl version ${version}`)
  }
  fs.chmodSync(kubectlPath, '777')
  return kubectlPath
}

async function run() {
  const version = core.getInput('version').trim() || 'latest'
  const args = core.getInput('args').trim() || ''
  const kubectlPath = await getKubectlPath(version)
  await exec(`${kubectlPath} ${args}`)
}

run().catch(error => {
  console.error(error)
  core.setFailed(error.message)
})
