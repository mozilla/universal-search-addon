# Addon-Content Messaging API

For each of these events, the general packet format is `{ type, data }`, where `type` is the name of the event, and `data` corresponds to the objects documented in code blocks. For events with no code block (like `popupopen`, `popupclose`), `data` will be `null`.

## Contents

* Addon to Content
  * Data events
    * [`autocomplete-search-results`](#autocomplete-search-results)
    * [`suggested-search-results`](#suggested-search-results)
  * UI events
    * [`navigational-key`](#navigational-key)
    * [`printable-key`](#printable-key)
    * [`popupopen`](#popupopen)
    * [`popupheight`](#popupheight)
    * [`popupclose`](#popupclose)
* Content to Addon
  * [`autocomplete-url-clicked`](#autocomplete-url-clicked)
  * [`url-selected`](#url-selected)
  * [`adjust-height`](#adjust-height)

---

# Messages Sent from Addon to Content

## Data Events

### `autocomplete-search-results`

This event contains autocomplete search results pulled from the Places DB, as well as the search term.

When the user types something in the address bar, we look for matches in history and bookmarks by running a Places query based on the existing autocomplete code. Note that the search only covers local history; synced data from remote browsers isn't included. The results are then sent down inside this event.

Note: if no results are returned, the results array will be empty.

Note: the current max number of results returned is 20; I made this up, it's trivial to change it.

```
{ results: array of result objects }

result:
{
  url: the page URL, which might be a browser-specific thing like "about:blank"
  title: page title
  image: favicon URL
  imageData: favicon image as Base64 data-uri (or null, if the file isn't cached)
  type: 'action' if the page is open,
        'bookmark' if the page is bookmarked,
        'favicon' otherwise.
        Originally based on XUL styling rules for the old popup.
  open: true if the page is currently open
  bookmark: null if not bookmarked, else an object of the form: {
    title: possibly user-edited title for the bookmarked page
    tags: user-created tags, if any, for the bookmarked page
  }
  text: the search term in the address bar
  fancyImageData: if we found a good image in the page, this is it as Base64
                  data uri (or null)
  description: if we found an opengraph or twitter description in the page,
               it's passed as this key (or it'll be null)
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

### `printable-key`

This event is sent when the user types a printable key (that is, a non-navigational key) in the address bar, or when the user hits Backspace (to update the iframe-delivered suggestion).

This event allows the iframe to use additional servers to generate suggested results.

It might be a bit of a misleading event name, since what we actually care about is sending over the contents of the urlbar. For instance, if the user inserted a character in the middle of a word in the urlbar, or if the user deletes a character in the middle of a phrase, it's much simpler to send over the new contents, than to send the change event with a position into the string.

```
{
  query: current contents of the urlbar
}
```

### `popupopen`

This event is sent when the popup is about to open.

Corresponds to XUL `popupshowing` event.

### `popupheight`

This event is sent when the popup is about to open (separately from the `popupopen` event), and after an `adjust-height` message has been received and acted on, confirming that the resize worked.

The event contents are the integer height of the popup in pixels (note that the message just contains the integer, and not the 'px' unit).

```
{
  height: integer pixel height of the popup
}
```

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

### `adjust-height`

This event should be sent when the iframe wants to change the height of its container.

After setting the height, the addon will wait a turn, then send back a `popupheight` event, so the iframe can confirm the resize worked.

The `popupheight` event is also sent each time the popup opens, so the iframe will know if it needs to request a height change.

```
{
  type: 'adjust-height',
  data: {
    height: integer value for the new height
  }
}
```

---

Note: this doc originally appeared at https://gist.github.com/6a68/48bf56e5b66e8631b522
