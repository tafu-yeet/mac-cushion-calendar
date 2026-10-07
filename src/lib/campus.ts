// School-specific values live in one file at the repo root, shared with the worker.
import config from "../../campus.config.json";

export const campus = config;
export const TIMEZONE = config.timezone;
