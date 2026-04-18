# Duplicate character in character class
Character classes in regular expressions (denoted by square brackets `[]`) represent sets of characters where the pattern matches any single character from that set. Since character classes are sets, specifying the same character multiple times is redundant and often indicates a programming error.

Common mistakes include:

* Using square brackets `[]` instead of parentheses `()` for grouping alternatives
* Misunderstanding that special regex characters like `|`, `*`, `+`, `()`, and `-` work differently when appearing inside a character class
* Accidentally duplicating characters or escape sequences that represent the same character

## Recommendation
Examine each duplicate character to determine the intended behavior:

* If you see `|` inside square brackets (e.g., `[a|b|c]`): This is usually a mistake. The author likely intended alternation. Replace the character class with a group: `(a|b|c)`
* If trying to match alternative strings, use parentheses `()` for grouping instead of square brackets
* If the duplicate was truly accidental, remove the redundant characters
* If trying to use special regex operators inside square brackets, note that most operators (like `|`) are treated as literal characters
Note that simply removing `|` characters from character classes is rarely the correct fix. Instead, analyze the pattern to understand what the author intended to match.


## Example
**Example 1: Confusing character classes with groups**

The pattern `[password|pwd]` does not match "password" or "pwd" as intended. Instead, it matches any single character from the set `{p, a, s, w, o, r, d, |}`. Note that `|` has no special meaning inside character classes.


```javascript
if (/[password|pwd] =/.test(input))
	console.log("Found password!");
```
To fix this problem, the regular expression should be rewritten to `/(password|pwd) =/`.

**Example 2: CSS unit matching**

The pattern `r?e[m|x]` appears to be trying to match "rem" or "rex", but actually matches "re" followed by any of the characters `{m, |, x}`. The correct pattern should be `r?e(m|x)` or `r?e[mx]`.

Similarly, `v[h|w|min|max]` should be `v(h|w|min|max)` to properly match "vh", "vw", "vmin", or "vmax".


## References
* Mozilla Developer Network: [JavaScript Regular Expressions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions).
* MDN: [Character Classes](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Character_Classes) - Details on how character classes work.
* MDN: [Groups and Ranges](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Groups_and_Ranges) - Proper use of grouping with parentheses.
