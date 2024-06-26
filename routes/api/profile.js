import express from "express";

import {
  getProfile,
  getSubjects,
  saveProfile,
} from "../../controllers/ProfileController.js";
import { generateStudyPlan, getStudyPlan } from "../../controllers/studyPlanController.js";

const router = express.Router();
router.route("/:email").get(getProfile);
router.route("/").post(saveProfile);
router.route("/generatestudyplan/:email").get(getStudyPlan);
router.route("/generatestudyplan").post(generateStudyPlan);
router.route("/subjects/:email").get(getSubjects);

export default router;
