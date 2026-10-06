# Markdown task grammar for automation

`scripts/markdown-tasks.py` defines the task syntax used by both
`implement-tasks.sh` and `fix-review.sh`. Counting, selection, implementation
dependency validation, blocked-task diagnostics, and checkbox manifests all
consume this parser. This is a deliberately limited Markdown grammar, not a
full Markdown renderer.

An executable task occupies one physical line outside a fenced code block:

```text
- [ ] Pending task.
 - [x] Completed task with one leading space.
  - [X] Completed task with two leading spaces.
   - [ ] Pending task with three leading spaces.
```

- Support zero through three ASCII spaces before `-`, exactly one space between
  `-` and the checkbox, and exactly one of space, `x`, or `X` inside brackets.
- After the closing bracket, require a space or tab before any text; an empty
  checkbox line also counts. Task descriptions and metadata stay on that line.
- Four or more leading spaces, leading tabs, blockquote prefixes, ordered lists,
  and `*` or `+` bullets are not executable tasks. Use supported indentation for
  nested work intended for automation; indentation does not create dependencies.
- Recognize fences of at least three backticks or tildes. A closing fence uses
  the same character, at least the opening length, and only spaces or tabs after
  it. Shorter fences, the other character, and trailing text do not close it.
  Opening fences may have an info string; backtick info strings cannot contain
  backticks. An unclosed fence excludes everything through the end of that file.
- Fence detection accepts any space/tab indentation, conservatively excluding
  examples even inside indented lists or code. Fence state resets for each file.
- Both LF and CRLF files and a final line without a newline are supported.

Fenced examples never contribute IDs, dependencies, counts, selections, or
manifest entries. A real dependency cannot refer to an ID defined only in an
example. Existing metadata rules in the [task convention](README.md#5-requirement-ids)
still apply; the review runner processes findings in document order without
interpreting dependency metadata.

The implementation runner recursively reads `.md` files in path order, then
physical line order within each file; the review runner reads its configured
document. Parser manifests contain tab-separated path, one-based line number,
state (`pending` or `complete`), and original task line. The assigned document
is checked in full after the agent returns; examples in that document must
therefore remain unchanged too. Other-document manifests track only executable
tasks, including their positions and wording.

The parser is part of the sealed wrapper snapshot. Changes to its workspace
copy are rejected like changes to the runners. Test the grammar with
`node tests/runner-markdown-tasks.js` and both full runner flows with
`node tests/runner-control-plane.js`; these tests run offline with fake agents.
