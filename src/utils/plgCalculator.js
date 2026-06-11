const fv = (rate, nper, pmt, pv = 0, type = 0) => {
  if (rate === 0) return -(pv + pmt * nper);
  const factor = Math.pow(1 + rate, nper);
  return -(pv * factor + pmt * (1 + rate * type) * ((factor - 1) / rate));
};

const round2 = (v) => Math.round(v * 100) / 100;

const resolveMonthlyRent = (p) => {
  if (p.rentType === "Per Sq Ft") {
    if (!p.rentPerSqftMonthly || !p.carpetArea) return null;
    return parseFloat(p.rentPerSqftMonthly) * parseFloat(p.carpetArea);
  }
  return p.totalMonthlyRent ? parseFloat(p.totalMonthlyRent) : null;
};

const resolveSecurityDeposit = (p, monthlyRent) => {
  if (p.securityDepositType === "Months of Rent") {
    if (!p.securityDepositMonths || !monthlyRent) return null;
    return parseFloat(p.securityDepositMonths) * monthlyRent;
  }
  return p.securityDepositAmount ? parseFloat(p.securityDepositAmount) : null;
};

const resolveMaintenancePerSqFt = (p) => {
  if (!p.maintenanceCostsIncluded || p.maintenanceCostsIncluded === "Yes, included in rent") {
    return 0;
  }
  if (!p.maintenanceAmount) return 0;
  if (p.maintenanceType === "Per Sq Ft") return parseFloat(p.maintenanceAmount);
  if (p.carpetArea && parseFloat(p.carpetArea) > 0) {
    return parseFloat(p.maintenanceAmount) / parseFloat(p.carpetArea);
  }
  return 0;
};

const computePLGMetrics = (p) => {
  const purchasePrice = p.sellingPrice ? parseFloat(p.sellingPrice) : null;
  const carpetArea = p.carpetArea ? parseFloat(p.carpetArea) : null;
  const monthlyRent = resolveMonthlyRent(p);
  const securityDeposit = resolveSecurityDeposit(p, monthlyRent);
  const leaseStartDate = p.leaseStartDate ? new Date(p.leaseStartDate) : null;
  const leaseTermYears = p.leaseDurationYears ? parseFloat(p.leaseDurationYears) : null;

  let escalationRate = p.annualEscalationPercent ? parseFloat(p.annualEscalationPercent) : null;
  if (escalationRate !== null && escalationRate > 1) escalationRate /= 100;

  if (!purchasePrice || !monthlyRent || !leaseStartDate || !leaseTermYears) return null;

  const esc = escalationRate ?? 0;
  const deposit = securityDeposit ?? 0;
  const area = carpetArea ?? 0;
  const tax = p.propertyTaxAnnual ? parseFloat(p.propertyTaxAnnual) : 0;
  const insurance = p.insuranceAnnual ? parseFloat(p.insuranceAnnual) : 0;
  const maintPerSqFt = resolveMaintenancePerSqFt(p);

  const msPerDay = 1000 * 60 * 60 * 24;
  const actualLeaseYear = (new Date() - leaseStartDate) / (msPerDay * 365);
  const leaseYearForCalc = Math.floor(actualLeaseYear);
  const yearsLeft = leaseTermYears - actualLeaseYear;
  const roundYearsLeft = Math.max(0, Math.floor(yearsLeft));
  const balanceMonths = Math.max(0, Math.floor(((yearsLeft - roundYearsLeft) * 365) / 30));

  const currentRent = monthlyRent * Math.pow(1 + esc, leaseYearForCalc);
  const oneTimeCosts = tax + insurance;
  const maintenanceCost = maintPerSqFt * area * roundYearsLeft * 12;

  const balanceCashFlow = balanceMonths * currentRent;
  const nextYearsCashFlow = roundYearsLeft > 0 ? -fv(esc, roundYearsLeft, currentRent * 12, 0, 1) : 0;
  const depositInterestCurrent = deposit > 0
    ? fv(0.065 / 12, balanceMonths, 0, -deposit, 0) - deposit : 0;
  const depositInterestNext = deposit > 0 && roundYearsLeft > 0
    ? fv(0.065 / 12, roundYearsLeft * 12, 0, -deposit, 0) - deposit : 0;

  const totalCashFlows = balanceCashFlow + nextYearsCashFlow + depositInterestCurrent + depositInterestNext;
  const totalExpenses = oneTimeCosts + maintenanceCost;
  const noi = totalCashFlows - totalExpenses;
  const roi = purchasePrice > 0 ? noi / purchasePrice : 0;

  const annualGrossRent = currentRent * 12;
  const grossRentalYield = purchasePrice > 0 ? (annualGrossRent / purchasePrice) * 100 : 0;
  const annualNOI = annualGrossRent - oneTimeCosts;
  const netRentalYield = purchasePrice > 0 ? (annualNOI / purchasePrice) * 100 : 0;
  const paybackPeriodYears = annualGrossRent > 0 ? purchasePrice / annualGrossRent : null;

  return {
    annualGrossRent: round2(annualGrossRent),
    grossRentalYield: round2(grossRentalYield),
    netRentalYield: round2(netRentalYield),
    paybackPeriodYears: paybackPeriodYears ? round2(paybackPeriodYears) : null,
    plgDetail: {
      inputs: {
        purchasePrice,
        monthlyRent,
        currentMonthlyRent: round2(currentRent),
        securityDeposit: deposit,
        escalationRatePercent: round2(esc * 100),
        leaseTermYears,
        carpetArea: area,
      },
      leaseStatus: {
        actualLeaseYear: round2(actualLeaseYear),
        leaseYearForCalc,
        yearsLeftInLease: round2(Math.max(0, yearsLeft)),
        roundYearsLeft,
        balanceMonthsCurrentTenure: balanceMonths,
      },
      cashFlows: {
        balanceRentalCashFlowCurrentYear: round2(balanceCashFlow),
        annualCashFlowFromRentNextYears: round2(nextYearsCashFlow),
        interestOnDepositCurrentYear: round2(depositInterestCurrent),
        interestOnDepositNextYears: round2(depositInterestNext),
        annualInterestOnDeposit: round2(deposit * 0.065),
        totalCashFlows: round2(totalCashFlows),
      },
      expenses: {
        oneTimeExpenseTotal: round2(oneTimeCosts),
        maintenanceCost: round2(maintenanceCost),
        totalExpenses: round2(totalExpenses),
      },
      summary: {
        netOperatingIncome: round2(noi),
        roi: round2(roi),
        roiPercent: round2(roi * 100),
        totalInitialInvestment: round2(purchasePrice + oneTimeCosts),
      },
    },
  };
};

const computeStoredMetrics = (fields) => {
  const purchasePrice = parseFloat(fields.sellingPrice || 0);
  const monthlyRent = resolveMonthlyRent(fields);
  const tax = parseFloat(fields.propertyTaxAnnual || 0);
  const insurance = parseFloat(fields.insuranceAnnual || 0);
  const otherCosts = parseFloat(fields.otherCostsAnnual || 0);
  const totalOperatingAnnualCosts = tax + insurance + otherCosts || null;

  if (!monthlyRent || !purchasePrice) {
    return {
      annualGrossRent: null,
      grossRentalYield: null,
      netRentalYield: null,
      paybackPeriodYears: null,
      totalOperatingAnnualCosts,
    };
  }

  const annualGrossRent = monthlyRent * 12;
  const annualNOI = annualGrossRent - (tax + insurance + otherCosts);
  // Clamp displayed yields to a sane 0..999.99 range (never negative).
  const clamp = (val) => Math.max(0, Math.min(val, 999.99));

  return {
    annualGrossRent: round2(annualGrossRent),
    grossRentalYield: round2(clamp((annualGrossRent / purchasePrice) * 100)),
    netRentalYield: round2(clamp((annualNOI / purchasePrice) * 100)),
    paybackPeriodYears: round2(clamp(purchasePrice / annualGrossRent)),
    totalOperatingAnnualCosts: round2(tax + insurance + otherCosts) || null,
  };
};

module.exports = { computePLGMetrics, computeStoredMetrics };
