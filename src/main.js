const fs = require("fs");
const pro = require("util").promisify;

async function resolve(context, refResolver, modResolver) {

	if (typeof context === "string" && context.startsWith("-> ")) {
		
		context = refResolver(context.slice(3));
		
	} else {

		if (typeof context === "object") {
			for (let key in context) {
				context[key] = await resolve(context[key], refResolver, modResolver);
			}
		}

		if (context && context.module) {
			let config = Object.assign({}, context);
			delete config.module;
			context = modResolver(context.module);
			if (context instanceof Function) {
				context = await context(config);
			}
		}
	}
	
	return context;
}
;

module.exports = {

	async load(modResolver, file) {

		file = file || "config.json";

		let context = JSON.parse(await pro(fs.readFile)(file, "utf8"));

		try {
			return resolve(context, exp => {
				with (Object.assign(context, {"$": process.env})) {
					return eval(exp);
				}
			}, modResolver);
		} catch (e) {
			throw `Error reading configuration file '${file}': ${e.message || e}`;
		}

	}

};

