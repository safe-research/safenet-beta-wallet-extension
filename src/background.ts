import browser from 'webextension-polyfill'

browser.runtime.onInstalled.addListener(() => {
  console.log('Safenet Beta Wallet Extension installed')
})
