const asyncHandler = require("../utils/asyncHandler");
const createAppError = require("../utils/appError");
const { sendEncodedResponse } = require("../utils/responseEncoder");

const fv = (rate, nper, pmt, pv = 0, type = 0) => {
  if (rate === 0) return -(pv + pmt * nper);
  const factor = Math.pow(1 + rate, nper);
  return -(pv * factor + pmt * (1 + rate * type) * ((factor - 1) / rate));
};

const round2 = (v) => Math.round(v * 100) / 100;

const REQUIRED_FIELDS = [
  "carpetArea",
  "purchasePrice",
  "monthlyRent",
  "securityDeposit",
  "rentEscalationEveryHowManyYears",
  "rentEscalationPercent",
  "leaseStartDate",
  "leaseTermYears",
  "propertyTax",
  "maintenancePerSqFtPerMonth",
  "insurance",
  "stampDutyPercent",
  "legalFees",
  "brokerage",
  "otherOneTimeCosts",
];

const calculatePLG = asyncHandler(async (req, res, next) => {
  for (const key of REQUIRED_FIELDS) {
    const val = req.body[key];
    if (val === undefined || val === null || val === "") {
      return next(createAppError(`Missing required field: ${key}`, 400));
    }
    if (key !== "leaseStartDate" && isNaN(Number(val))) {
      return next(createAppError(`Field must be a number: ${key}`, 400));
    }
  }

  const startDate = new Date(req.body.leaseStartDate);
  if (isNaN(startDate.getTime())) {
    return next(createAppError("Invalid leaseStartDate format", 400));
  }

  const n = {
    carpetArea: Number(req.body.carpetArea),
    purchasePrice: Number(req.body.purchasePrice),
    monthlyRent: Number(req.body.monthlyRent),
    securityDeposit: Number(req.body.securityDeposit),
    rentEscalationPercent: Number(req.body.rentEscalationPercent),
    leaseTermYears: Number(req.body.leaseTermYears),
    propertyTax: Number(req.body.propertyTax),
    maintenancePerSqFtPerMonth: Number(req.body.maintenancePerSqFtPerMonth),
    insurance: Number(req.body.insurance),
    stampDutyPercent: Number(req.body.stampDutyPercent),
    legalFees: Number(req.body.legalFees),
    brokerage: Number(req.body.brokerage),
    otherOneTimeCosts: Number(req.body.otherOneTimeCosts),
  };

  const msPerDay = 1000 * 60 * 60 * 24;
  const actualLeaseYear = (new Date() - startDate) / (msPerDay * 365);
  const leaseYearForCalc = Math.floor(actualLeaseYear);
  // Clamp to >= 0 so an expired lease (start date in the past) doesn't produce
  // negative months/years and blow up the projection.
  const yearsLeft = Math.max(0, n.leaseTermYears - actualLeaseYear);
  const roundYearsLeft = Math.max(0, Math.floor(yearsLeft));
  const balanceMonths = Math.max(
    0,
    Math.floor(((yearsLeft - roundYearsLeft) * 365) / 30)
  );

  const currentRent = n.monthlyRent * Math.pow(1 + n.rentEscalationPercent, leaseYearForCalc);

  const oneTimeCosts =
    n.propertyTax +
    n.insurance +
    n.stampDutyPercent * n.purchasePrice +
    n.legalFees +
    n.brokerage +
    n.otherOneTimeCosts;

  const maintenanceCost = n.maintenancePerSqFtPerMonth * n.carpetArea * roundYearsLeft * 12;

  const balanceCashFlow = balanceMonths * currentRent;
  const nextYearsCashFlow = -fv(n.rentEscalationPercent, roundYearsLeft, currentRent * 12, 0, 1);
  const depositInterestCurrent = fv(0.065 / 12, balanceMonths, 0, -n.securityDeposit, 0) - n.securityDeposit;
  const depositInterestNext = fv(0.065 / 12, roundYearsLeft * 12, 0, -n.securityDeposit, 0) - n.securityDeposit;

  const totalCashFlows = balanceCashFlow + nextYearsCashFlow + depositInterestCurrent + depositInterestNext;
  const totalExpenses = oneTimeCosts + maintenanceCost;
  const noi = totalCashFlows - totalExpenses;
  const roi = n.purchasePrice > 0 ? noi / n.purchasePrice : 0; // guard divide-by-zero

  const result = {
    inputs: {
      propertyType: req.body.propertyType || null,
      carpetArea: n.carpetArea,
      purchasePrice: n.purchasePrice,
      monthlyRent: n.monthlyRent,
      securityDeposit: n.securityDeposit,
      rentEscalationPercent: n.rentEscalationPercent,
      leaseStartDate: req.body.leaseStartDate,
      leaseTermYears: n.leaseTermYears,
    },
    interimCalculations: {
      actualLeaseYear: round2(actualLeaseYear),
      leaseYearForCalc,
      yearsLeftInLease: round2(yearsLeft),
      roundYearsLeft,
      balanceMonthsCurrentTenure: balanceMonths,
      currentMonthlyRent: round2(currentRent),
      annualInterestOnDeposit: round2(n.securityDeposit * 0.065),
      oneTimeExpenseTotal: round2(oneTimeCosts),
      maintenanceCost: round2(maintenanceCost),
    },
    cashFlows: {
      balanceRentalCashFlowCurrentYear: round2(balanceCashFlow),
      annualCashFlowFromRentNextYears: round2(nextYearsCashFlow),
      interestOnDepositCurrentYear: round2(depositInterestCurrent),
      interestOnDepositNextYears: round2(depositInterestNext),
      totalCashFlows: round2(totalCashFlows),
      totalExpenses: round2(totalExpenses),
    },
    summary: {
      netOperatingIncome: round2(noi),
      roi: round2(roi),
      roiPercent: round2(roi * 100),
      totalInitialInvestment: round2(n.purchasePrice + oneTimeCosts),
    },
  };

  return sendEncodedResponse(res, 200, true, "PLG calculation successful", result);
});

const generateReport = asyncHandler(async (req, res, next) => {
  for (const key of REQUIRED_FIELDS) {
    const val = req.body[key];
    if (val === undefined || val === null || val === "") {
      return next(createAppError(`Missing required field: ${key}`, 400));
    }
    if (key !== "leaseStartDate" && isNaN(Number(val))) {
      return next(createAppError(`Field must be a number: ${key}`, 400));
    }
  }

  const startDate = new Date(req.body.leaseStartDate);
  if (isNaN(startDate.getTime())) {
    return next(createAppError("Invalid leaseStartDate format", 400));
  }

  const n = {
    carpetArea: Number(req.body.carpetArea),
    purchasePrice: Number(req.body.purchasePrice),
    monthlyRent: Number(req.body.monthlyRent),
    securityDeposit: Number(req.body.securityDeposit),
    rentEscalationPercent: Number(req.body.rentEscalationPercent),
    rentEscalationEveryHowManyYears: Number(req.body.rentEscalationEveryHowManyYears) || 3,
    leaseTermYears: Number(req.body.leaseTermYears),
    propertyTax: Number(req.body.propertyTax),
    maintenancePerSqFtPerMonth: Number(req.body.maintenancePerSqFtPerMonth),
    insurance: Number(req.body.insurance),
    stampDutyPercent: Number(req.body.stampDutyPercent),
    legalFees: Number(req.body.legalFees),
    brokerage: Number(req.body.brokerage),
    otherOneTimeCosts: Number(req.body.otherOneTimeCosts),
  };

  const msPerDay = 1000 * 60 * 60 * 24;
  const actualLeaseYear = (new Date() - startDate) / (msPerDay * 365);
  const leaseYearForCalc = Math.floor(actualLeaseYear);
  // Clamp to >= 0 so an expired lease (start date in the past) doesn't produce
  // negative months/years and blow up the projection.
  const yearsLeft = Math.max(0, n.leaseTermYears - actualLeaseYear);
  const roundYearsLeft = Math.max(0, Math.floor(yearsLeft));
  const balanceMonths = Math.max(0, Math.floor(((yearsLeft - roundYearsLeft) * 365) / 30));

  const currentRent = n.monthlyRent * Math.pow(1 + n.rentEscalationPercent, leaseYearForCalc);
  const oneTimeCosts = n.propertyTax + n.insurance + n.stampDutyPercent * n.purchasePrice + n.legalFees + n.brokerage + n.otherOneTimeCosts;
  const maintenanceCost = n.maintenancePerSqFtPerMonth * n.carpetArea * roundYearsLeft * 12;
  const balanceCashFlow = balanceMonths * currentRent;
  const nextYearsCashFlow = -fv(n.rentEscalationPercent, roundYearsLeft, currentRent * 12, 0, 1);
  const depositInterestCurrent = fv(0.065 / 12, balanceMonths, 0, -n.securityDeposit, 0) - n.securityDeposit;
  const depositInterestNext = fv(0.065 / 12, roundYearsLeft * 12, 0, -n.securityDeposit, 0) - n.securityDeposit;
  const totalCashFlows = balanceCashFlow + nextYearsCashFlow + depositInterestCurrent + depositInterestNext;
  const totalExpenses = oneTimeCosts + maintenanceCost;
  const noi = totalCashFlows - totalExpenses;
  const roi = n.purchasePrice > 0 ? noi / n.purchasePrice : 0; // guard divide-by-zero

  // Build 10-year projections
  const annualRecurringExpenses = n.propertyTax + n.insurance + (n.maintenancePerSqFtPerMonth * n.carpetArea * 12);
  const projections = [];
  let projMonthlyRent = n.monthlyRent;
  let cumulative = 0;
  for (let year = 1; year <= 10; year++) {
    if (year > 1 && (year - 1) % n.rentEscalationEveryHowManyYears === 0) {
      projMonthlyRent = projMonthlyRent * (1 + n.rentEscalationPercent);
    }
    const annualRent = round2(projMonthlyRent * 12);
    const annualExpenses = round2(annualRecurringExpenses);
    const netCashFlow = round2(annualRent - annualExpenses);
    cumulative = round2(cumulative + netCashFlow);
    projections.push({ year, monthlyRent: round2(projMonthlyRent), annualRent, annualExpenses, netCashFlow, cumulativeCashFlow: cumulative });
  }

  const result = {
    inputs: {
      propertyType: req.body.propertyType || null,
      carpetArea: n.carpetArea,
      purchasePrice: n.purchasePrice,
      monthlyRent: n.monthlyRent,
      securityDeposit: n.securityDeposit,
      rentEscalationPercent: n.rentEscalationPercent,
      leaseStartDate: req.body.leaseStartDate,
      leaseTermYears: n.leaseTermYears,
    },
    summary: {
      netOperatingIncome: round2(noi),
      roi: round2(roi),
      roiPercent: round2(roi * 100),
      totalInitialInvestment: round2(n.purchasePrice + oneTimeCosts),
      oneTimeCosts: round2(oneTimeCosts),
      maintenanceCost: round2(maintenanceCost),
    },
    projections,
    reportGeneratedAt: new Date().toISOString(),
  };

  return sendEncodedResponse(res, 200, true, "Report generated successfully", result);
});

module.exports = { calculatePLG, generateReport };
