import { Router, type IRouter } from "express";
import {
  pool,
  startRefreshRun,
  executeRefreshRun,
  getLatestRefreshRun,
  RefreshAlreadyRunningError,
} from "@workspace/db";
import { requireOwnerTenant } from "../lib/scope";
import { requireAuth, type AuthedRequest } from "../lib/auth";

// Manual data-refresh control. Reuses the shared pipeline + concurrency lock in
// @workspace/db so a click runs the exact same incremental jobs the scheduled
// (6h) automation runs, and the two can never run at the same time.
const router: IRouter = Router();
router.use(requireAuth);
// whatsapp_messages has no tenant_id; only the owner's tenant may trigger/read.
router.use(requireOwnerTenant);

// Current/last cycle for the tenant — feeds "Atualizando..." + "última
// atualização" and the button's disabled state. Returns null before the first run.
router.get("/refresh/status", async (req: AuthedRequest, res) => {
  const run = await getLatestRefreshRun(pool, req.auth!.tenantId);
  res.json({ run });
});

// Start a manual incremental refresh. Fires the pipeline in the background and
// returns immediately (202). Refuses with 409 if a cycle is already running.
router.post("/refresh", async (req: AuthedRequest, res) => {
  const tenantId = req.auth!.tenantId;
  try {
    const run = await startRefreshRun(pool, { tenantId, trigger: "manual" });
    // Fire-and-forget: the long-running jobs must not block the HTTP response.
    void executeRefreshRun(pool, run).catch((err) => {
      req.log.error({ err }, "refresh pipeline failed");
    });
    res.status(202).json({ run });
  } catch (e) {
    if (e instanceof RefreshAlreadyRunningError) {
      res.status(409).json({ error: "already_running", run: e.run });
      return;
    }
    throw e;
  }
});

export default router;
