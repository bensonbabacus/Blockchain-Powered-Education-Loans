import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 200;
const ERR_LOAN_NOT_FOUND = 201;
const ERR_INVALID_REPAYMENT = 202;
const ERR_INSUFFICIENT_BALANCE = 203;
const ERR_INVALID_PERCENTAGE = 204;
const ERR_GRACE_PERIOD = 205;
const ERR_LOAN_REPAID = 206;
const ERR_INVALID_INCOME = 207;
const ERR_REPORT_EXISTS = 208;
const ERR_DEFAULTED = 209;
const ERR_INVALID_THRESHOLD = 210;
const ERR_UPDATE_NOT_ALLOWED = 211;
const ERR_INVALID_CURRENCY = 212;

interface LoanState {
  principal: number;
  totalDue: number;
  repaid: number;
  status: string;
  graceUntil: number;
  borrower: string;
  lender: string;
  currency: string;
  incomeThreshold?: number;
  repaymentPercentage?: number;
  lastReportTime?: number;
}

interface IncomeReport {
  income: number;
  reportedAt: number;
  verified: boolean;
  threshold: number;
  percentage: number;
}

interface Repayment {
  amount: number;
  paidAt: number;
  borrower: string;
  lender: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class RepaymentTrackerMock {
  state: {
    authority: string;
    loanStates: Map<number, LoanState>;
    incomeReports: Map<number, IncomeReport>;
    repayments: Map<string, Repayment>;
  } = {
    authority: "ST1AUTH",
    loanStates: new Map(),
    incomeReports: new Map(),
    repayments: new Map(),
  };
  blockHeight = 0;
  caller = "ST1AUTH";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      authority: "ST1AUTH",
      loanStates: new Map(),
      incomeReports: new Map(),
      repayments: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1AUTH";
    this.stxTransfers = [];
  }

  setAuthority(newAuth: string): Result<boolean> {
    if (this.caller !== this.state.authority)
      return { ok: false, value: false };
    this.state.authority = newAuth;
    return { ok: true, value: true };
  }

  initializeLoan(
    loanId: number,
    principal: number,
    interestRate: number,
    gracePeriod: number,
    threshold: number,
    percentage: number,
    borrower: string,
    lender: string,
    currency: string
  ): Result<boolean> {
    if (this.caller !== this.state.authority)
      return { ok: false, value: false };
    if (this.state.loanStates.has(loanId)) return { ok: false, value: false };
    if (percentage <= 0 || percentage > 100) return { ok: false, value: false };
    if (!["STX", "USD"].includes(currency)) return { ok: false, value: false };
    const totalDue = principal + Math.floor((principal * interestRate) / 10000);
    this.state.loanStates.set(loanId, {
      principal,
      totalDue,
      repaid: 0,
      status: "active",
      graceUntil: this.blockHeight + gracePeriod,
      borrower,
      lender,
      currency,
      incomeThreshold: threshold,
      repaymentPercentage: percentage,
    });
    return { ok: true, value: true };
  }

  reportIncome(loanId: number, income: number): Result<boolean> {
    const state = this.state.loanStates.get(loanId);
    if (!state) return { ok: false, value: false };
    if (this.caller !== state.borrower) return { ok: false, value: false };
    if (state.status !== "active") return { ok: false, value: false };
    if (this.state.incomeReports.has(loanId))
      return { ok: false, value: false };
    if (this.blockHeight < state.graceUntil) return { ok: false, value: false };
    if (income <= 0) return { ok: false, value: false };
    this.state.incomeReports.set(loanId, {
      income,
      reportedAt: this.blockHeight,
      verified: true,
      threshold: state.incomeThreshold!,
      percentage: state.repaymentPercentage!,
    });
    return { ok: true, value: true };
  }

  executeRepayment(loanId: number, cycle: number): Result<number> {
    const state = this.state.loanStates.get(loanId);
    const report = this.state.incomeReports.get(loanId);
    if (!state || !report) return { ok: false, value: 0 };
    if (this.caller !== state.borrower) return { ok: false, value: 0 };
    if (state.status !== "active") return { ok: false, value: 0 };
    if (report.income <= report.threshold) return { ok: false, value: 0 };
    const excess = report.income - report.threshold;
    const repayAmount = Math.floor((excess * report.percentage) / 100);
    const newRepaid = state.repaid + repayAmount;
    if (newRepaid > state.totalDue) return { ok: false, value: 0 };
    this.stxTransfers.push({
      amount: repayAmount,
      from: this.caller,
      to: state.lender,
    });
    const key = `${loanId}-${cycle}`;
    this.state.repayments.set(key, {
      amount: repayAmount,
      paidAt: this.blockHeight,
      borrower: this.caller,
      lender: state.lender,
    });
    const updated = {
      ...state,
      repaid: newRepaid,
      status: newRepaid >= state.totalDue ? "repaid" : "active",
    };
    this.state.loanStates.set(loanId, updated);
    this.state.incomeReports.delete(loanId);
    return { ok: true, value: repayAmount };
  }

  markDefault(loanId: number): Result<boolean> {
    const state = this.state.loanStates.get(loanId);
    if (!state) return { ok: false, value: false };
    if (this.caller !== state.lender) return { ok: false, value: false };
    if (state.status !== "active") return { ok: false, value: false };
    if (this.blockHeight - (state.lastReportTime || 0) <= 100)
      return { ok: false, value: false };
    this.state.loanStates.set(loanId, { ...state, status: "default" });
    return { ok: true, value: true };
  }

  updateTerms(
    loanId: number,
    newThreshold: number,
    newPercentage: number
  ): Result<boolean> {
    const state = this.state.loanStates.get(loanId);
    if (!state) return { ok: false, value: false };
    if (this.caller !== state.lender) return { ok: false, value: false };
    if (newPercentage <= 0 || newPercentage > 100)
      return { ok: false, value: false };
    if (newThreshold <= 0) return { ok: false, value: false };
    this.state.loanStates.set(loanId, {
      ...state,
      incomeThreshold: newThreshold,
      repaymentPercentage: newPercentage,
    });
    return { ok: true, value: true };
  }

  getLoanState(loanId: number): LoanState | null {
    return this.state.loanStates.get(loanId) || null;
  }
}

describe("RepaymentTrackerContract", () => {
  let contract: RepaymentTrackerMock;

  beforeEach(() => {
    contract = new RepaymentTrackerMock();
    contract.reset();
  });

  it("reports income after grace period", () => {
    contract.initializeLoan(
      1,
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      "STX"
    );
    contract.caller = "ST3BORROWER";
    contract.blockHeight = 101;
    const result = contract.reportIncome(1, 70000);
    expect(result.ok).toBe(true);
    const report = contract.state.incomeReports.get(1);
    expect(report?.income).toBe(70000);
  });

  it("executes repayment correctly", () => {
    contract.initializeLoan(
      1,
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      "STX"
    );
    contract.caller = "ST3BORROWER";
    contract.blockHeight = 101;
    contract.reportIncome(1, 70000);
    const result = contract.executeRepayment(1, 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2000);
    const state = contract.getLoanState(1);
    expect(state?.repaid).toBe(2000);
  });

  it("defaults loan after missed reporting", () => {
    contract.initializeLoan(
      1,
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      "STX"
    );
    contract.caller = "ST4LENDER";
    contract.blockHeight = 201;
    const result = contract.markDefault(1);
    expect(result.ok).toBe(true);
    const state = contract.getLoanState(1);
    expect(state?.status).toBe("default");
  });

  it("updates terms by lender", () => {
    contract.initializeLoan(
      1,
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      "STX"
    );
    contract.caller = "ST4LENDER";
    const result = contract.updateTerms(1, 60000, 15);
    expect(result.ok).toBe(true);
    const state = contract.getLoanState(1);
    expect(state?.incomeThreshold).toBe(60000);
    expect(state?.repaymentPercentage).toBe(15);
  });
});
