import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cabinForecastCoordinates } from "./weatherAlerts";

describe("cabinForecastCoordinates", () => {
  test("uses the stored centre of the picked municipality without geocoding", async () => {
    const geocode = async () => assert.fail("must not geocode");
    const coords = await cabinForecastCoordinates({ latitude: 49.1638, longitude: 16.0158, weatherLocation: "Třebenice" }, geocode);
    assert.deepEqual(coords, { lat: 49.1638, lon: 16.0158 });
  });

  test("a cabin without a picked municipality geocodes its text location as before", async () => {
    const asked: string[] = [];
    const geocode = async (location: string) => {
      asked.push(location);
      return { lat: 50.48, lon: 13.99 };
    };
    const coords = await cabinForecastCoordinates({ latitude: null, longitude: null, weatherLocation: "Trebenice" }, geocode);
    assert.deepEqual(coords, { lat: 50.48, lon: 13.99 });
    assert.deepEqual(asked, ["Trebenice"]);
  });

  test("a cabin without any location has no coordinates", async () => {
    assert.equal(await cabinForecastCoordinates({ latitude: null, longitude: null, weatherLocation: null }, async () => null), null);
  });
});
