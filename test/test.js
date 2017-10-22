var assert = require('assert');

describe("AppGlue", function() {
		
		let appglue = require("../src/main.js");			
		
		it("works", async function() {
			
			let context = await appglue.load(require, `${__dirname}/config.json`);
			
			assert.equal(context.refTest[0].b, "value of a is AAA");
			assert.ok(context.envTest.startsWith("/"), "envTest failed");
		});
});
