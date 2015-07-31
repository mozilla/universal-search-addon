# Addon-Content Messaging API

For each of these events, the general packet format is `{ type, data }`, where `type` is the name of the event, and `data` corresponds to the objects documented in code blocks. For events with no code block (like `popupopen`, `popupclose`), `data` will be `null`.

## Contents

* Addon to Content
  * Data events
    * [`autocomplete-search-results`](#autocomplete-search-results)
    * [`suggested-search-results`](#suggested-search-results)
  * UI events
    * [`navigational-key`](#navigational-key)
    * [`popupopen`](#popupopen)
    * [`popupclose`](#popupclose)
* Content to Addon
  * [`autocomplete-url-clicked`](#autocomplete-url-clicked)
  * [`url-selected`](url-selected)

---

# Messages Sent from Addon to Content

## Data Events

### `autocomplete-search-results`

This event contains autocomplete search results pulled from the Places DB, as well as the search term.

When the user types something in the address bar, the autocomplete search service looks through history/bookmarks/other unknown local stuff, and comes up with a list of results. The results are then sent down inside this event.

Note: if no results are returned, the results array will be empty.

Note: the current max number of results returned is 5; I made this up, it's trivial to change it.

```
{ results: array of result objects }

result:
{
  url: the page URL, which might be a browser-specific thing like "about:blank"
       or "moz-action:switchtab,http://example.com"
  title: page title
  image: favicon URL (or null, if the browser has no favicon)
  type: "bookmark" or "favicon" or "action favicon"...I don't know what these mean,
        maybe they are classes used in styling the xul list items?
  text: the search term in the address bar
}
```

### `suggested-search-results`

This event contains local and remote search suggestions, as well as the current search term.

When the user types something in the address bar, the search suggestion service looks for local matches (not sure how these work), and also sends the search term to a remote suggestion service. Not sure what happens if suggestions are disabled.

```
{
  engine: name of the user's default search engine, used to get suggestions.
  results: {
    term: the search string
    local: an array of local suggestions (I'm not sure why/when these display,
           but for my dummy profile it's always an empty list)
    remote: an array of search suggestions that come from the user's default 
            search service
  }
}
```

## UI Events

### `navigational-key`

This event is sent when the user types a navigational key in the address bar which is either the Enter key, or a key that should change the selected item in the iframe.

Use `shiftKey` to decide if a `Tab` key corresponds to a shift-Tab or a Tab.

```
{
  key: event.key value for the key event, one of 'Tab', 'PageUp', 'PageDown',
       'ArrowUp', 'ArrowDown', 'Enter'
  shiftKey: true if the shift key is pressed
}
```

### `popupopen`

This event is sent when the popup is about to open.

Corresponds to XUL `popupshowing` event.

### `popupclose`

This event is sent to the iframe when the popup is about to close.

Corresponds to XUL `popuphiding` event.

This event is not sent down if the popup is pinned open (`Popup.isPinned`).

---

# Messages Sent from Content to Addon

WebChannel message sending looks like this (from MDN):

```
window.dispatchEvent(new window.CustomEvent("WebChannelMessageToChrome", {
  detail: {
    id: webChannelId,
    message: {
      something: true
    }
  }
});
```

The `message` is what's documented for each of these signals.

### `autocomplete-url-clicked`

This event should be sent to the browser when the user clicks on an item in the iframe.

The browser will then navigate the current tab to the url in the event.

```
{
  type: 'autocomplete-url-clicked',
  data: {
    result: the text contents of the item clicked by the user, could be a search
            suggestion or a url
    resultType: 'suggestion' or 'url'
  }
}
```

### `url-selected`

This event should be sent in response to a `navigational-key` event.

When the browser sends a `navigational-key` event, the iframe will adjust the selected item, then use this event to send the url of the newly-selected item back to the browser.

If the selected item is an autocomplete URL, use the `url` type. The browser will display the url in the address bar.
If the selected item is a search suggestion, use the `suggestion` type. The browser will display the search suggestion in the address bar.
If there is no selected item and the user has hit Enter, use the `empty` type. The browser will navigate to whatever's in the address bar.

```
{
  type: 'url-selected',
  data: {
    result: the text contents of the item selected by the user, could be a
            search suggestion or a url
    resultType: 'suggestion' or 'url' or 'empty'
  }
}
```

---

Note: this doc originally appeared at https://gist.github.com/6a68/48bf56e5b66e8631b522
