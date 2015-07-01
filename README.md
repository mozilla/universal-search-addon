# universal-search-addon
universal search desktop experiments in addon format

Installation / how to hack on this?
- set up https on your local machine
  - here's a gist with how I got this working (yosemite / built-in apache): https://gist.github.com/6a68/40b5eda14c82a25e253b
- add a proxy file to the FF profile you will use for addon development
  - The proxy file connects a copy of FF to a local directory that holds addon source code.
  - See MDN for more: https://developer.mozilla.org/en-US/Add-ons/Setting_up_extension_development_environment#Firefox_extension_proxy_file
- major TODO: the iframe path needs to be specified using prefs, but using https makes this a bit of a headache.
  - by default, the iframe points at our cloudfront server, which does use https.

Release process:
  1. Manually bump the version number in `install.rdf` and `update.rdf`.
  1. Bump the version number in package.json using `npm version patch`. This will generate a git tag, too.
  1. Zip up a new addon: `rm -rf dist && mkdir dist && zip -r dist/addon.xpi *`
  1. Release the addon to people: `scp dist/addon.xpi jhirsch@people.mozilla.org:public_html/universal-search-addon/addon.xpi`
  1. Release the update.rdf file to people: `scp update.rdf jhirsch@people.mozilla.org:public_html/universal-search-addon/update.rdf`
  1. Probably email the universal-search list?
