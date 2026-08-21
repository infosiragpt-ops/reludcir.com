import assert from "node:assert/strict";
import test from "node:test";

import {
  districtLandingPageSlugs,
  isDistrictLandingPageSlug,
} from "../src/data/district-landing-pages";
import { districts } from "../src/data/site";

test("publishes landing pages for all nine service districts", () => {
  assert.equal(districtLandingPageSlugs.length, 9);
  assert.equal(districts.length, 9);
  assert.ok(districts.some((district) => district.slug === "magdalena-del-mar"));
  assert.ok(isDistrictLandingPageSlug("magdalena"));
  assert.equal(isDistrictLandingPageSlug("magdalena-del-mar"), false);

  for (const district of districts) {
    const landingSlug =
      district.slug === "magdalena-del-mar" ? "magdalena" : district.slug;
    assert.ok(
      isDistrictLandingPageSlug(landingSlug),
      `missing landing page for ${district.slug}`,
    );
  }
});
