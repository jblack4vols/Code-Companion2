import type { Express } from "express";
import { requireRole } from "./shared";
import * as marketerRoiStorage from "../storage-marketer-roi";

export function registerMarketerRoiRoutes(app: Express) {
  app.get("/api/marketer-roi", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const months = req.query.months ? parseInt(req.query.months as string, 10) : 6;
      const data = await marketerRoiStorage.getMarketerRoi({
        months: Number.isFinite(months) && months > 0 ? months : 6,
      });
      res.json(data);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
