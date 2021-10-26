# appglue
Simple dependency injection for Node.js.

## Purpose

The appglue library removes typical Node.js hardcoded references caused by `require()` or `import`. This is achieved by "inverting the control" in a way, that modules are wired together by simple JSON file. 

The JSON file describes references between modules and may also inject environment variables to further help with application configuration.

Although the name of the JSON file may be overridden, we will refer to this file as `config.json` as it is the default name.

## API

The library takes the `config.json`, resolves all the module references and returns an object which is the application context.

The context may be returned by asynchronous method `load` e.g.:
```js
let context = await require("@burgrp/appglue")({require}).load();
```

Or there is handy function `main` to simplify application startup code:
```js
require("@burgrp/appglue")({require}).main(async context => {
    // do something with context
});
```

The `{require}` parameter is mandatory. Passing the caller's `require` reference is needed to properly resolve modules.

There is also an optional parameter `file`, which is the name of configuration JSON. As mentioned above, this defaults to `config.json`. Good practice is to initialize appglue with `{require, file: __dirname + "/config.json"}`, which makes the application independent of current working directory.

## Hello world

Let's start with an artificial example - a simple application which consist of two JS modules: `main` and `greeter`. The greeter will export a function `greet(who)`.

The `config.json` looks like:
```json
{
    "greeter": {
        "module": "./greeter.js"
    }
}
```

The top level module `main.js` looks like:
```js
require("@burgrp/appglue")({require}).main(context => {
    context.greeter.greet("Joe");
});
```

And the greeter module `greeter.js` looks like:
```js
module.exports = context => {
    return {
        greet(who) {
            console.info(`Hello ${who}!`)
        }
    }
}
```

Note that the greeter module is a factory function, which returns an object. This is appglue idiom. The returned value, in this case the greeter object, is the resolved value inserted into application context. The context parameter is the nested, and already resolved, context inside the module. 

#### Module parameters
In our simple example the context parameter will be empty, but what about to pass some parameters to greeter?

Then we add `greeting` property to the `config.json`:
```json
{
    "greeter": {
        "module": "./greeter.js",
        "greeting": "Hello"
    }
}
```

And use that property in `greeter.js`:
```js
module.exports = ({greeting}) => {
    return {
        greet(who) {
            console.info(`${greeting} ${who}!`)
        }
    }
}
```

#### Reusing modules

Now imagine we want to have two greeters, one formal, one informal.

We would change `config.json` to have two greeters:
```json
{
    "formal": {
        "module": "./greeter.js",
        "greeting": "Good morning"
    },
    "informal": {
        "module": "./greeter.js",
        "greeting": "Howdy"
    }
}
```

And then we can refer both in `main.js`:
```js
require("@burgrp/appglue")({require}).main(({formal, informal}) => {
    formal.greet("Mr. Novak");
    informal.greet("Joe");
});
```

#### In-context references

One module may get reference to another part of the context, if it was already resolved (i.e. referenced context must precede the referring context).

For example, we want to have a new module responsible for writing the string to console. 

So we add the new module to `config.json` and add references:
```json
{
    "writer": {
        "module": "./writer.js"
    },
    "formal": {
        "module": "./greeter.js",
        "greeting": "Good morning",
        "writer": "-> writer"
    },
    "informal": {
        "module": "./greeter.js",
        "greeting": "Howdy",
        "writer": "-> writer"
    }
}
```

The new `writer.js` module would look like:
```js
module.exports = () => {
    return {
        write(str) {
            console.info(str);
        }
    }
}
```

Modified `greeter.js` like:
```js
module.exports = ({greeting, writer}) => {
    return {
        greet(who) {
            writer.write(`${greeting} ${who}!`)
        }
    }
}
```

Note that anything behind `->` is normal js code, evaluated in the already resolved context, so it may be more complex expression than just `-> writer`.

#### Environment variables

Environment variables are available in evaluation expression (`->`) either directly with `$` prefix, or as map named `$`. This means that e.g. environment variable `HOME` is available by one of two ways:
- $TEST 
- $.TEST

The difference is that `$TEST` makes the reference mandatory and initialization will fail, if `TEST` environment variable is undefined. Since `$` is map of all environment variables and is always defined, `$.TEST` resolves to `undefined` but does not fail.

One could also reference environment variable with default value by `-> $.TEST || 'my-default-value'`.

In our example, if we want to make both greetings configurable, we change `config.json` to:
```json
{
    "writer": {
        "module": "./writer.js"
    },
    "formal": {
        "module": "./greeter.js",
        "greeting": "-> $.FORMAL_GREETING || 'Good morning'",
        "writer": "-> writer"
    },
    "informal": {
        "module": "./greeter.js",
        "greeting": "-> $.INFORMAL_GREETING || 'Howdy'",
        "writer": "-> writer"
    }
}
```

This way we made our example configurable by environment variables without touching JS code itself. We can see application structure, environment references and defaults values on sight.

#### Late references

References by `->` are resolved on the first pass which leads to restriction, that only already resolved parts of the context may be resolved. As the context is resolved recursively from top to bottom, one can reference only those parts of the context, which precede the reference. In our example, the reference `-> writer` would not work, if modules are listed in `config.json` in order `formal`, `informal`, `writer`. 

To overcome this restriction, we may use so called late reference. Late reference is prefixed with `=>` instead of `->` and the reference resolves to parameter-less function (aka getter), which returns the reference value, when called.

If we would need, in our example, to put `writer` behind `formal` and `informal`, our `config.json` looks like:
```json
{
    "formal": {
        "module": "./greeter.js",
        "greeting": "-> $.FORMAL_GREETING || 'Good morning'",
        "getWriter": "=> writer"
    },
    "informal": {
        "module": "./greeter.js",
        "greeting": "-> $.INFORMAL_GREETING || 'Howdy'",
        "getWriter": "=> writer"
    },
    "writer": {
        "module": "./writer.js"
    }
}
```

And because of late reference we get the getter instead of immediate value, we would need to change `greeter.js` to:
```js
module.exports = ({greeting, getWriter}) => {
    return {
        greet(who) {
            getWriter().write(`${greeting} ${who}!`)
        }
    }
}
```

#### 

#### Type of the value returned by module function

In our example modules always return an object with functions. This resembles library style. But module function may return value of any type, including number, string, single function or array.

#### Nested modules

In our example we had only three modules, defined on the same level. Note that since modules are resolved recursively, they may be nested as needed. Any nested module becomes the owner's module initialization parameter.

#### Mixing constant objects and modules in context

Since the context is JSON structure, modules may be inserted to any level in the structure. The only key to identify the module is the `module` string property. If there is `module` property, the object is resolved as module. If there is no `module` property, the object is passed as-is to the context.

## Await / async

Appglue fully supports asynchronous coding style, so module function may be `async`. Also the function passed to `main(fnc)` function may be `async`.

## License
Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).
