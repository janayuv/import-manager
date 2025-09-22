# Suspicious method name declaration
In TypeScript, certain keywords have special meanings for member declarations, and misusing them can create confusion:

* In classes, use `constructor` rather than `new` to declare constructors. Using `new` within a class creates a method named "new" and not a constructor signature.
* In interfaces, use `new` rather than `constructor` to declare constructor signatures. Using `constructor` within an interface creates a method named "constructor" and not a constructor signature.
* Similarly, the keyword `function` is used to declare functions in some contexts. However, using the name `function` for a class or interface member declaration declares a method named "function".
When these keywords are misused, TypeScript will interpret them as regular method names rather than their intended special syntax, leading to code that may not work as expected.


## Recommendation
Consider following these guidelines for clearer code:

* For classes, use `constructor` to declare constructors.
* For interfaces, use `new` to declare constructor signatures (call signatures that create new instances).
* Avoid accidentally creating methods named `function` by misusing the `function` keyword within class or interface declarations.

## Example
The following examples show common mistakes when using these keywords:

This interface mistakenly uses `constructor`, which creates a method named "constructor" instead of a constructor signature:


```javascript
// BAD: Using 'constructor' in an interface creates a method, not a constructor signature
interface Point {
   x: number;
   y: number;
   constructor(x: number, y: number); // This is just a method named "constructor"
}

```
Use `new` for constructor signatures in interfaces:


```javascript
// GOOD: Using 'new' for constructor signatures in interfaces
interface Point {
   x: number;
   y: number;
   new(x: number, y: number): Point; // This is a proper constructor signature
}

```
This class mistakenly uses `new`, which creates a method named "new" instead of a constructor:


```javascript
// BAD: Using 'new' in a class creates a method, not a constructor
class Point {
   x: number;
   y: number;
   new(x: number, y: number) {}; // This is just a method named "new"
}

```
Use `constructor` for constructors in classes:


```javascript
// GOOD: Using 'constructor' for constructors in classes
class Point {
   x: number;
   y: number;
   constructor(x: number, y: number) { // This is a proper constructor
      this.x = x;
      this.y = y;
   }
}

```
This interface uses `function` as a method name, which declares a method named "function" rather than declaring a function:


```javascript
// BAD: Using 'function' as a method name is confusing
interface Calculator {
   function(a: number, b: number): number; // This is just a method named "function"
}

```
Use a descriptive method name instead:


```javascript
// GOOD: Using descriptive method names instead of 'function'
interface Calculator {
   calculate(a: number, b: number): number; // Clear, descriptive method name
}

```

## References
* TypeScript Handbook: [Classes - Constructors](https://www.typescriptlang.org/docs/handbook/2/classes.html#constructors).
* TypeScript specification: [Constructor Type Literals](https://github.com/microsoft/TypeScript/blob/30cb20434a6b117e007a4959b2a7c16489f86069/doc/spec-ARCHIVED.md#3.8.9).
* TypeScript specification: [Constructor Parameters](https://github.com/microsoft/TypeScript/blob/30cb20434a6b117e007a4959b2a7c16489f86069/doc/spec-ARCHIVED.md#8.3.1).
