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

			if (context.module instanceof Function) {
				context = context.module;
			} else if (typeof context.module === "string") {
				context = modResolver(context.module);
			}

			if (context instanceof Function) {
				context = await context(config);
			}
		}
	}

	return context;
}

module.exports = (config = {}) => {

	return {

		async load() {

			let env = Object.assign({}, process.env);

			let localEnvDir = "./env";

			try {
				for (file of (await (pro(fs.readdir)(localEnvDir)))) {
					env[file] = await (pro(fs.readFile)(`${localEnvDir}/${file}`, "utf8"));
				}
			} catch (e) {
				if (e.code !== "ENOENT") {
					throw e;
				}
			}
			
			let topLevelEnv = {};
			Object.entries(env).forEach(([k, v]) => {
				try {
					v = JSON.parse(v);
				} catch (e) {
					if (e.name !== "SyntaxError") {
						throw e;
					}
				}
				env[k] = v;
				topLevelEnv["$" + k] = v;
			});

			file = config.file || "config.json";

			let context = JSON.parse(await pro(fs.readFile)(file, "utf8"));
			context.module = context.module || config.root;

			try {
				return resolve(context, exp => {
					with (Object.assign({$: env}, context, topLevelEnv)) {
						return eval(exp);
					}
				}, config.require);
			} catch (e) {
				throw `Error reading configuration file '${file}': ${e.message || e}`;
			}

		},

		main(asyncInitializer) {
			(async () => {
				let config = await this.load();
				if (config.start instanceof Function) {
					await config.start();					
				}
				if (asyncInitializer) {
					await asyncInitializer(config);
				}
			})().catch(e => {
				console.error(e);
				process.exit(1);
			});
		}

	};

};
