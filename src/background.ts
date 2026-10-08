import browser from 'webextension-polyfill'

browser.runtime.onInstalled.addListener(() => {
  console.log('Safenet Aegis Wallet Extension installed')
})
