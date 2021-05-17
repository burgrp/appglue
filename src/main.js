const fs = require("fs");
const pro = require("util").promisify;
const vm = require("vm");

module.exports = (options = {}) => {

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

			file = options.file || "config.json";

			let rootDef = JSON.parse(await pro(fs.readFile)(file, "utf8"));
			rootDef.module = rootDef.module || options.root;

			let rootCtx = {};

			function evalInRootCtx(exp) {
				with (Object.assign({ $: env }, rootCtx, topLevelEnv)) {
					return eval(exp);
				}
			}

			async function resolve(def, path, objSeed) {
				//console.info("-----------------------", path, "-----------------------");

				try {

					if (def instanceof Array) {
						let arr = [];

						for (let index in def) {
							arr[index] = await resolve(def[index], path + "[" + index + "]");
						}

						return arr;
					}


					if (typeof def === "object") {

						let val = objSeed || {};

						for (let key in def) {

							let valDef = def[key];

							if (key !== "module") {
								val[key] = await resolve(valDef, path + (path.endsWith("/") ? "" : "/") + key);
							}
						}

						if (def.module) {
							if (def.module instanceof Function) {
								val = await def.module(val);
							} else {
								let req = options.require || require;
								let mod = req(def.module);
								if (mod instanceof Function) {
									val = await mod(val);
								}
							}
						}

						return val;
					}

					if (typeof def === "string") {
						if (def.startsWith("-> ")) {
							let exp = def.substr(3);
							return evalInRootCtx(exp);
						} else if (def.startsWith("=> ")) {
							let exp = def.substr(3);
							return () => evalInRootCtx(exp);
						}
					}

					return def;

				} catch (e) {
					e.path = e.path || path;
					throw e;
				}

			}

			return result = await resolve(rootDef, "/", rootCtx);
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
				if (e.path) {
					console.error("Error on context path", e.path);
				}
				console.error(e.stack || e);
				process.exit(1);
			});
		}

	};

};
