# This repo is deprecated

The `<iframe>` approach is presently on hold. Follow the latest [Universal Search](https://wiki.mozilla.org/Firefox/Universal_Search) developments at the [mozilla/universal-search](https://github.com/mozilla/universal-search) repository and on its [Waffle.io board](https://waffle.io/mozilla/universal-search). 

# universal-search-addon

Universal Search desktop experiments in addon format

[![Build Status](https://travis-ci.org/mozilla/universal-search-addon.svg?branch=master)](https://travis-ci.org/mozilla/universal-search-addon)
[![Stories in Ready](https://badge.waffle.io/mozilla/universal-search-addon.png?label=ready&title=Ready)](https://waffle.io/mozilla/universal-search-addon)

## Developer setup

### Basic addon environment
These steps come from the [extension dev page](https://developer.mozilla.org/en-US/Add-ons/Setting_up_extension_development_environment) on MDN. Look there for lots more detail.

1. Make some changes to your Firefox profile, or create a separate profile.
  - It's nice to create a separate addon profile, but not necessary.
  - In either case, there are some prefs used for addon development; you can easily add them by installing the [devprefs addon](https://addons.mozilla.org/en-US/firefox/addon/devprefs/).
  - Note: the extension signing requirement is not yet handled by the devprefs addon, so you must:
    - open the `about:config` page
    - search for `xpinstall.signatures.required`
    - toggle it to `false`
1. Create a proxy file to link your local addon code to your addon profile.
  - The proxy file is just a file inside your addon profile's `extensions` directory, where the file name matches the addon's name (in our case, `universal-search-addon@mozilla.com`), and the file contains the absolute path to the code, with a trailing slash.
  - Example:
    - proxy file: `/path/to/ff/Profiles/6h6ygzlo.addon-dev/extensions/universal-search-addon@mozilla.com`
    - proxy file contents: `/Users/jhirsch/codez/github/mozilla-universal-search-addon/src/`
1. When you want to hack on the addon, start Firefox from the command line:
  - `/Applications/Firefox.app/Contents/MacOS/firefox -purgecaches -P "addon-dev"`
    - `-P "addon-dev"` specifies which profile to use
    - `-purgecaches` stops FF from caching files, so you can instantly (?) see changes

### Setup specific to this addon

By default, the addon connects to an iframe hosted at `https://d1fnkpeapwua2i.cloudfront.net`. If you're not planning to make changes to the iframe, which contains the visible UI contents of the awesomebar dropdown, then you're done with setup.

If you are interested in hacking on the [iframe](https://github.com/mozilla/universal-search-content), then you'll need to [clone and set up the iframe repo](https://github.com/mozilla/universal-search-content/blob/master/README.md), add a few prefs to your profile, and accept a self-signed SSL cert:
  - Surf to `about:config` and add two string prefs (right click in the page, then choose New -> String, see [this SUMO page](https://support.mozilla.org/en-US/kb/about-config-editor-firefox) for detailed screenshots):
    - Create a pref called `services.universalSearch.frameURL`, with a value of `https://localhost:8080/index.html`
    - Create another pref called `services.universalSearch.baseURL`, with a value of `https://localhost:8080/`
  - The first time you use a local iframe, you'll probably be serving it from `https://localhost:8080/`. You will get a security warning, it'll look something like this: ![](https://www.dropbox.com/s/9ieyvpimtfkmqo4/Screenshot%202015-07-21%2014.52.10.png?dl=0&raw=true)
To work around the security warning, try the following:
  - Surf to the iframe URL (**the enter key won't work**. You will have to click the Go Button, the little right arrow at the edge of the address bar)
  - Once you load the page, add a security exception for the self-signed cert provided by the local content server.
  - Restart the browser, and you should see the iframe contents without problems.

### That's it!

You now have the code working locally. Any addon code changes should be visible after restarting your browser. If you have a local copy of the iframe, any iframe changes will be visible when you open a new browser window (we reload the iframe each time a new window is opened).

Next, take a look at our [contributing docs](https://github.com/mozilla/universal-search-addon/blob/master/CONTRIBUTING.md), which explain our dev process and our project's code of conduct.

Finally, please file an issue on Github if you ran into problems with these setup docs, or think they could be improved. Pull requests with improvements are even better ^_^

## Release process:
  1. Use one of the following commands to bump the package.json version number and create an XPI:
    - `npm run release-major`: Bumps the package.json `version` major version number.
    - `npm run release-minor`: Bumps the package.json `version` minor version number.
    - `npm run release-patch`: Bumps the package.json `version` patch version number.
    - `npm run release`: Alias for `npm run release-patch`.
  1. Commit the `src/*.rdf` changes and push to master.
  1. If a content release is connected with the addon release, push the content changes and wait till CloudFront invalidation is complete (~15 minutes) before continuing.
  1. Submit the xpi to AMO for automated signing.
  1. Release the signed addon to people: `scp dist/addon.xpi jhirsch@people.mozilla.org:public_html/universal-search-addon/addon.xpi`
  1. Release the dist/update.rdf file to people: `scp dist/update.rdf jhirsch@people.mozilla.org:public_html/universal-search-addon/update.rdf`
  1. Update the topic in the universal-search channel
  1. Probably email the universal-search list?

## Useful Snippets

#### Simulating iframe events
We use pubsub to mediate connections between the Transport and everything else.

This means that faking an event from the iframe is easy, once you know the name and contents of the expected event.

Find the complete list of events from either the docs/API.md file, or by grepping for '::' in the src directory.

If you want to see an example event object, then uncomment the console.log inside `Transport.sendMessage`, trigger the event you care about, and you should be able to inspect the logged object inside the Browser Toolbox.

Once you know the signal you want to simulate, you need a pointer to the broker, in order to fire a fake signal into the app. This is easy to do, because the app global is visible on the ChromeWindow. For instance, if you want to fire an `adjust-height` event, open up the Browser Toolbox and type this: `window.US.broker.publish('iframe::adjust-height', { height: 100 })`. The popup should look shorter next time you type something in the urlbar :-). If you want to instantly see the effect on the popup, pin it open (see the 'force the popup to stay open' snippet).

#### Force the popup to stay open
Note: By design, this only works on one window at a time.
  - Enable & open the Browser Toolkit (see [MDN docs](https://developer.mozilla.org/en-US/docs/Tools/Browser_Toolbox#Enabling_the_Browser_Toolbox), it's easy)
  - At the console, type: `window.US.popup.isPinned = true`
  - Next time the popup opens, it'll stay open.
  - Set `window.US.popup.isPinned` to `false` when you're done - or just close the window.
  - Note: the Browser Toolkit slows performance down a lot. Close it if you don't need to actively debug stuff, and the iframe will be much snappier.

