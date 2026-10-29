import {
  parseUsdHourlyRate,
  calculatePhpMonthlyRange,
  formatPhpMonthlyRange,
  convertToPhpMonthlyRange,
  phpMonthlyToUsdHourly,
  displayRateForRegion,
} from "./jobRates";

describe("jobRates", () => {
  describe("parseUsdHourlyRate", () => {
    it("parses a simple USD hourly rate", () => {
      expect(parseUsdHourlyRate("$5/hr")).toBe(5);
      expect(parseUsdHourlyRate("$6")).toBe(6);
    });

    it("parses the lower bound of a range with extras", () => {
      expect(parseUsdHourlyRate("$5.50 - $7.50/hr (40hrs/week)")).toBe(5.5);
      expect(parseUsdHourlyRate("$6.5/hr - $7/hr Depending on experience")).toBe(6.5);
    });

    it("returns null for PHP rates", () => {
      expect(parseUsdHourlyRate("₱44,800 - ₱56,000/month")).toBeNull();
    });
  });

  describe("convertToPhpMonthlyRange", () => {
    it("converts USD hourly to the PHP monthly range (40-50 hrs/week)", () => {
      expect(convertToPhpMonthlyRange("$5/hr")).toBe("₱44,800 - ₱56,000/month");
      expect(convertToPhpMonthlyRange("$4.90/hr")).toBe("₱43,904 - ₱54,880/month");
      expect(convertToPhpMonthlyRange("$10/hr")).toBe("₱89,600 - ₱112,000/month");
    });

    it("leaves PHP or unparseable rates unchanged", () => {
      expect(convertToPhpMonthlyRange("₱44,800 - ₱56,000/month")).toBe("₱44,800 - ₱56,000/month");
      expect(convertToPhpMonthlyRange("Negotiable")).toBe("Negotiable");
    });
  });

  describe("phpMonthlyToUsdHourly", () => {
    it("reverse-converts a legacy PHP monthly rate to USD hourly", () => {
      expect(phpMonthlyToUsdHourly("₱44,800 - ₱56,000/month")).toBe("$5/hr");
      expect(phpMonthlyToUsdHourly("₱43,904 - ₱54,880/month")).toBe("$4.90/hr");
      expect(phpMonthlyToUsdHourly("₱89,600 - ₱112,000/month")).toBe("$10/hr");
    });

    it("returns null for non-PHP rates", () => {
      expect(phpMonthlyToUsdHourly("$5/hr")).toBeNull();
    });
  });

  describe("round trip", () => {
    it("PHP display converts back to the original USD hourly rate", () => {
      for (const rate of ["$5/hr", "$4.90/hr", "$5.50/hr", "$6.80/hr", "$10/hr"]) {
        expect(phpMonthlyToUsdHourly(convertToPhpMonthlyRange(rate))).toBe(rate);
      }
    });
  });

  describe("displayRateForRegion", () => {
    it("Global keeps the $ hourly rate", () => {
      expect(displayRateForRegion("$5.50 - $7.50/hr (40hrs/week)", "global")).toBe("$5.50 - $7.50/hr (40hrs/week)");
    });

    it("Global reverse-converts legacy PHP rates to $ hourly", () => {
      expect(displayRateForRegion("₱44,800 - ₱56,000/month", "global")).toBe("$5/hr");
    });

    it("Philippines shows the PHP monthly range", () => {
      expect(displayRateForRegion("$5/hr", "philippines")).toBe("₱44,800 - ₱56,000/month");
      // Legacy stored PHP stays PHP
      expect(displayRateForRegion("₱44,800 - ₱56,000/month", "philippines")).toBe("₱44,800 - ₱56,000/month");
    });

    it("Latin America keeps the $ hourly rate", () => {
      expect(displayRateForRegion("$6 - $8 /Hourly", "latin-america")).toBe("$6 - $8 /Hourly");
    });

    it("unparseable rates pass through untouched", () => {
      expect(displayRateForRegion("Negotiable", "global")).toBe("Negotiable");
    });
  });

  describe("format helpers", () => {
    it("calculatePhpMonthlyRange uses the fixed constants", () => {
      expect(calculatePhpMonthlyRange(5)).toEqual({ min: 44800, max: 56000 });
    });

    it("formatPhpMonthlyRange formats with peso signs", () => {
      expect(formatPhpMonthlyRange(44800, 56000)).toBe("₱44,800 - ₱56,000/month");
    });
  });
});
