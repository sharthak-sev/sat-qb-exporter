chrome.runtime.sendMessage({
  type: "pageSeen",
  href: window.location.href,
  title: document.title,
  seenAt: Date.now()
}).catch(() => {
  // The background worker may be asleep; auth capture still happens via webRequest.
});
