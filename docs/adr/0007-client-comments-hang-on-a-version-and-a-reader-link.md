# Client comments hang on a version and an element, and a reader link names the commenter

Status: proposed with the LA-1480 spec (`docs/precon/client-comments-spec.md`). It takes
effect when Matt approves that spec.

A client who opens a published budget at `/b/<token>` will be able to comment on, ask
about, or flag an assumption on any element of the page. Two choices underneath that
feature are easy to reopen later, and both are hard to change once comments exist.

## A comment belongs to one version and one element id

A thread stores the published budget it was posted on and the `data-el` id of the
element, plus an anchor (section, label, the text or figure shown) that the server takes
from the presentation model at post time. It never stores a DOM path or a page position.
A published budget is frozen, so inside its own version a thread's element can never
change or disappear.

When a new version is published, open and answered threads carry forward onto the
element with the same id, and show what changed when the anchor no longer matches. A
thread whose id is gone from the new version is listed apart from the elements, quoting
its anchor, until Kulka answers and closes it. Nothing moves a thread to a guessed
element. Ids keyed by a position in a list (`note:<n>`, `line:<code>:comparable:<i>`)
carry only when the text is identical.

This makes LA-1309's id rule binding for every new kind of element: a key comes from the
snapshot's data and never from a label, a position or the DOM, and one element has one
id wherever it shows.

## A reader link names the commenter

Production runs with sign-in off, Matt deferred password sign-in, and the app cannot send
email until Kulka's COO finishes the domain and SMTP setup. So nothing can prove who is
typing. The estimator instead adds each person who should comment to the project and
sends that person their own link. Opening it sets a cookie and redirects to the plain
version link, so the key leaves the address bar. Every post carries that reader. The
plain link stays open to read and takes no comments, so a budget handed to a lender
carries none of the owner's questions.

A forwarded reader link can still post as its reader. The page shows whose name a post
goes under, every post records a device cookie so Kulka sees a new device, and Kulka can
revoke a reader link. When email works, an emailed code on a new device can be added with
no schema change.

## Considered and rejected

- **Typed name and email on each post.** Anyone could post as anyone.
- **Email codes or magic links.** Blocked on Kulka's SMTP.
- **Client accounts with passwords.** Matt deferred password sign-in.
- **Comments open on the plain link.** The link travels to lenders and partners.
- **Re-pointing an orphaned comment to the nearest element.** A guess would put a
  client's words on a figure they never saw.

## Consequences

- Three new tables, `budget_readers`, `budget_threads` and `budget_messages`, with row
  level security on and no policies, reached only by server routes.
- Every post route builds the page model from the frozen snapshot to check the element
  id and take the anchor.
- Publishing a version also marks accepted flags as carried into it.
- The LA-1479 drill-down must give each assumption, inclusion and exclusion a key in the
  model before it gets an id.
