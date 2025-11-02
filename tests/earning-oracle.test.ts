import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 300;
const ERR_INVALID_DEGREE = 301;
const ERR_INVALID_LOCATION = 302;
const ERR_INVALID_YEARS = 303;
const ERR_INVALID_SALARY = 304;
const ERR_PROJECTION_EXISTS = 305;
const ERR_PROJECTION_NOT_FOUND = 306;
const ERR_INVALID_CONFIDENCE = 307;
const ERR_INVALID_UPDATE_PARAM = 308;
const ERR_INVALID_CURRENCY = 309;
const ERR_MAX_PROJECTIONS = 310;
const ERR_ORACLE_NOT_SET = 311;

interface DegreeSalary {
  avgSalary: number;
  medianSalary: number;
  confidence: number;
  lastUpdated: number;
  dataPoints: number;
}

interface Projection {
  student: string;
  degree: string;
  location: string;
  yearsExperience: number;
  projectedSalary: number;
  confidenceScore: number;
  createdAt: number;
  updatedAt: number;
  currency: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class EarningOracleMock {
  state: {
    oraclePrincipal: string;
    maxProjections: number;
    updateFee: number;
    degreeSalary: Map<string, DegreeSalary>;
    projections: Map<number, Projection>;
    nextProjectionId: number;
  } = {
    oraclePrincipal: "ST1ORACLE",
    maxProjections: 10000,
    updateFee: 100,
    degreeSalary: new Map(),
    projections: new Map(),
    nextProjectionId: 0,
  };
  blockHeight = 0;
  caller = "ST1ORACLE";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      oraclePrincipal: "ST1ORACLE",
      maxProjections: 10000,
      updateFee: 100,
      degreeSalary: new Map(),
      projections: new Map(),
      nextProjectionId: 0,
    };
    this.blockHeight = 0;
    this.caller = "ST1ORACLE";
    this.stxTransfers = [];
  }

  setOracle(newOracle: string): Result<boolean> {
    if (this.caller !== this.state.oraclePrincipal)
      return { ok: false, value: false };
    this.state.oraclePrincipal = newOracle;
    return { ok: true, value: true };
  }

  setMaxProjections(newMax: number): Result<boolean> {
    if (this.caller !== this.state.oraclePrincipal)
      return { ok: false, value: false };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxProjections = newMax;
    return { ok: true, value: true };
  }

  setUpdateFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.oraclePrincipal)
      return { ok: false, value: false };
    this.state.updateFee = newFee;
    return { ok: true, value: true };
  }

  updateDegreeSalary(
    degree: string,
    location: string,
    avgSalary: number,
    medianSalary: number,
    confidence: number
  ): Result<boolean> {
    if (this.caller !== this.state.oraclePrincipal)
      return { ok: false, value: false };
    if (!degree || degree.length > 50) return { ok: false, value: false };
    if (!location || location.length > 50) return { ok: false, value: false };
    if (avgSalary <= 0 || medianSalary <= 0) return { ok: false, value: false };
    if (confidence < 0 || confidence > 100) return { ok: false, value: false };
    const key = `${degree}-${location}`;
    const existing = this.state.degreeSalary.get(key);
    const dataPoints = existing ? existing.dataPoints + 1 : 1;
    this.state.degreeSalary.set(key, {
      avgSalary,
      medianSalary,
      confidence,
      lastUpdated: this.blockHeight,
      dataPoints,
    });
    return { ok: true, value: true };
  }

  createProjection(
    student: string,
    degree: string,
    location: string,
    yearsExperience: number,
    currency: string
  ): Result<number> {
    if (this.state.nextProjectionId >= this.state.maxProjections)
      return { ok: false, value: ERR_MAX_PROJECTIONS };
    if (!degree || degree.length > 50)
      return { ok: false, value: ERR_INVALID_DEGREE };
    if (!location || location.length > 50)
      return { ok: false, value: ERR_INVALID_LOCATION };
    if (yearsExperience > 10) return { ok: false, value: ERR_INVALID_YEARS };
    if (!["STX", "USD"].includes(currency))
      return { ok: false, value: ERR_INVALID_CURRENCY };
    const key = `${degree}-${location}`;
    const salaryData = this.state.degreeSalary.get(key);
    if (!salaryData) return { ok: false, value: ERR_PROJECTION_NOT_FOUND };
    const baseSalary = salaryData.avgSalary + yearsExperience * 5000;
    const projected = Math.floor((baseSalary * salaryData.confidence) / 100);
    const id = this.state.nextProjectionId;
    this.state.projections.set(id, {
      student,
      degree,
      location,
      yearsExperience,
      projectedSalary: projected,
      confidenceScore: salaryData.confidence,
      createdAt: this.blockHeight,
      updatedAt: this.blockHeight,
      currency,
    });
    this.state.nextProjectionId++;
    return { ok: true, value: id };
  }

  updateProjection(
    id: number,
    newDegree: string,
    newLocation: string,
    newYears: number
  ): Result<boolean> {
    const proj = this.state.projections.get(id);
    if (!proj) return { ok: false, value: false };
    if (this.caller !== proj.student) return { ok: false, value: false };
    if (!newDegree || newDegree.length > 50) return { ok: false, value: false };
    if (!newLocation || newLocation.length > 50)
      return { ok: false, value: false };
    if (newYears > 10) return { ok: false, value: false };
    const key = `${newDegree}-${newLocation}`;
    const salaryData = this.state.degreeSalary.get(key);
    if (!salaryData) return { ok: false, value: false };
    this.stxTransfers.push({
      amount: this.state.updateFee,
      from: this.caller,
      to: this.state.oraclePrincipal,
    });
    const base = salaryData.avgSalary + newYears * 5000;
    const projected = Math.floor((base * salaryData.confidence) / 100);
    this.state.projections.set(id, {
      ...proj,
      degree: newDegree,
      location: newLocation,
      yearsExperience: newYears,
      projectedSalary: projected,
      confidenceScore: salaryData.confidence,
      updatedAt: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  getProjection(id: number): Projection | null {
    return this.state.projections.get(id) || null;
  }
}

describe("EarningOracleContract", () => {
  let contract: EarningOracleMock;

  beforeEach(() => {
    contract = new EarningOracleMock();
    contract.reset();
  });

  it("updates degree salary data", () => {
    const result = contract.updateDegreeSalary(
      "Computer Science",
      "New York",
      120000,
      115000,
      95
    );
    expect(result.ok).toBe(true);
    const key = "Computer Science-New York";
    const data = contract.state.degreeSalary.get(key);
    expect(data?.avgSalary).toBe(120000);
    expect(data?.confidence).toBe(95);
    expect(data?.dataPoints).toBe(1);
  });

  it("rejects projection without salary data", () => {
    const result = contract.createProjection(
      "ST2STUDENT",
      "Unknown Degree",
      "Mars",
      1,
      "USD"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PROJECTION_NOT_FOUND);
  });

  it("enforces max projections", () => {
    contract.setMaxProjections(1);
    contract.updateDegreeSalary("CS", "NY", 100000, 95000, 90);
    contract.createProjection("S1", "CS", "NY", 0, "USD");
    const result = contract.createProjection("S2", "CS", "NY", 0, "USD");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_PROJECTIONS);
  });
});
