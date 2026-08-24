# Toss product specification

Status: MVP

## Product statement

Toss creates small, shareable random selectors. A selector contains one or more
groups. Each group selects a configured number of unique options. The complete
selector and an optional deterministic result travel inside the URL fragment.
No server, account, or network storage is required.

Examples:

- choose one beer from twelve;
- assemble a restaurant order from salad, main, and drink groups;
- choose three films from one list;
- create a tasting flight with two snacks and three drinks.

## Primary flow

### Step 1: Build

The user:

1. names the selector;
2. adds one or more groups;
3. names each group;
4. adds options to each group;
5. sets `pickCount` as “pick N of M” for each group;
6. chooses group background and text colors;
7. saves the selector locally or opens its Run screen.

The interface displays the total result count as the sum of all group
`pickCount` values. Every edit replaces the URL with an editing-state link, so
reload and sharing preserve an unfinished form.

### Step 2: Run

The initial Run URL contains the selector payload without a result seed. The
user presses Toss. The browser generates a random seed, updates the URL, plays
the Toss animation, and reveals results grouped by source group.

The resulting URL reproduces the same result when opened elsewhere. Pressing
Toss again generates a new seed and replaces the result URL.

## Data model

Logical Elm model:

```elm
type alias Picker =
    { id : Int
    , title : String
    , mechanic : Mechanic
    , groups : List Group
    }

type Mechanic
    = Toss

type alias Group =
    { name : String
    , background : String
    , foreground : String
    , pickCount : Int
    , options : List Option
    }

type alias Option =
    { label : String }
```

`Mechanic` is explicit so future presentation mechanics can reuse selectors
without changing group semantics.

## Selection semantics

- Every group is selected independently.
- Selection inside a group occurs without replacement.
- Result count equals `sum(group.pickCount)`.
- `1 <= pickCount <= nonEmptyOptionCount`.
- A deterministic ordering is derived from the result seed and group index.
- The first `pickCount` options from that ordering form the group result.

Duplicate labels remain separate positional options. Empty labels are invalid
and never enter the selection pool.

## URL format

Use the fragment, not the query string:

```text
https://example.test/#e.<payload>
https://example.test/#r.<payload>
https://example.test/#r.<payload>~<seed>
```

The fragment never reaches a static host. Base64URL makes the payload compact
and visually opaque, but does not provide secrecy. `e.` opens Build. `r.` opens
Run. Legacy unprefixed payloads remain valid and open Run.

The final canonical URL, including origin, mode prefix, payload, separator, and
optional seed, must not exceed 2,000 characters. The app encodes on every edit,
shows the exact final length, and blocks Continue above the limit.

Payload version 1 uses a positional binary format:

```text
version:u8
title:utf8
mechanic:u8
groupCount:varuint
groups[]:
  name:utf8
  background:rgb24
  foreground:rgb24
  pickCount:varuint
  optionCount:varuint
  options[]:
    label:utf8
    reservedImageUrl:utf8
```

UTF-8 strings use a varuint byte length followed by bytes. The seed is a
positive 31-bit integer encoded separately in Base36. Unknown versions fail
closed and show a recoverable invalid-link state. New links always write the
reserved image URL as an empty string. Decoding consumes and ignores it so old
version 1 links containing image URLs still work.

## Local persistence

`localStorage` stores a JSON array of local selectors under a versioned key.
JSON is acceptable locally; shared URLs use the positional codec above.

- Multiple selectors may be stored.
- Saving updates a selector with the same local ID.
- Opening a shared selector creates an unsaved working copy.
- Local state remains available without a network connection after the file is
  loaded.

## Visual system

- Mobile-first responsive layout.
- Builder uses stacked group cards on narrow screens and editor/preview columns
  when space permits.
- Minimum interactive target: 44 CSS pixels.
- Each group preview and result uses its configured background and text colors.
- Native color inputs provide the initial color picker.
- Toss animation treats options as physical cards thrown onto a result surface.
- `prefers-reduced-motion` disables displacement and spin.

## Validation and recovery

Run is blocked when:

- selector title is empty;
- no group exists;
- a group name is empty;
- a group contains an empty option;
- a group has fewer valid options than `pickCount`;
- the final encoded URL exceeds 2,000 characters.

Validation appears beside the affected control and in a concise summary. An
invalid shared payload opens the builder with an explanation; local selectors
remain untouched.

## MVP acceptance scenarios

### Happy path

Given a selector with Beer and Food groups,
when the user sets Beer to pick one and Food to pick two, customizes colors,
opens Run, and presses Toss,
then three unique results appear under their groups and the URL gains a seed.

### Reproducible share

Given a completed Toss URL,
when another browser opens it,
then it renders the same grouped result without local state.

### Editable share

Given an unfinished selector in Build,
when its `#e.` URL is reloaded or opened in another browser,
then the same form values remain editable. Continue changes the mode to `#r.`;
Change restores `#e.` without losing values.

### Validation failure

Given a group containing an empty option,
when the user tries to open Run,
then the builder remains visible and identifies the empty option.

### Responsive use

Given a 390 CSS pixel viewport,
when the user builds and runs a selector,
then controls remain reachable without horizontal scrolling.

## Deferred

- encrypted “sealed selector” links;
- per-result reroll counters;
- weighted options;
- collaborative exclusion across devices;
- embedded image bytes;
- image URLs;
- additional mechanics such as wheel, cards, or slot machine;
- server persistence and accounts.
