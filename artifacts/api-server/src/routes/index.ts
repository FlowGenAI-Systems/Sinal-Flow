import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import metricsRouter from "./metrics";
import topicsRouter from "./topics";
import groupsRouter from "./groups";
import mentionsRouter from "./mentions";
import contactsRouter from "./contacts";
import tasksRouter from "./tasks";
import savedRouter from "./saved";
import entitiesRouter from "./entities";
import mediaRouter from "./media";
import googleRouter from "./google";
import searchRouter from "./search";
import refreshRouter from "./refresh";
import sellersRouter from "./sellers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
// Mounted before the authed routers: its public OAuth callback must be reachable
// without a session.
router.use(googleRouter);
router.use(metricsRouter);
router.use(topicsRouter);
router.use(groupsRouter);
router.use(mentionsRouter);
router.use(contactsRouter);
router.use(tasksRouter);
router.use(savedRouter);
router.use(entitiesRouter);
router.use(mediaRouter);
router.use(searchRouter);
router.use(refreshRouter);
router.use(sellersRouter);

export default router;
