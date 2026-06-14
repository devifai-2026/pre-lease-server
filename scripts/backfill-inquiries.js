// One-time backfill:
//  1. Reassign any enquiry currently held by a non-Client-Dealer (e.g. a Sales
//     Manager) to the least-loaded active Client Dealer.
//  2. Set every enquiry with no stage to the default "New" stage (+ history).
//
// Run: node scripts/backfill-inquiries.js
require("dotenv").config();
const { Op } = require("sequelize");
const {
  sequelize,
  User,
  Role,
  PropertyInquiry,
  InquiryStage,
  InquiryStatusHistory,
} = require("../src/models");
const {
  getDefaultStage,
  pickLeastLoadedDealer,
  CLIENT_DEALER_ROLE,
} = require("../src/utils/inquiryAssignment");

(async () => {
  try {
    await sequelize.authenticate();
    console.log("DB connected.");

    // ---- 1. Reassign enquiries held by a non-Client-Dealer ----
    const dealers = await User.findAll({
      attributes: ["userId"],
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          where: { roleName: CLIENT_DEALER_ROLE, isActive: true },
          attributes: [],
        },
      ],
    });
    const dealerIdSet = new Set(dealers.map((d) => d.userId));

    const assigned = await PropertyInquiry.findAll({
      where: { assignedTo: { [Op.not]: null } },
      attributes: ["id", "assignedTo"],
    });
    const misassigned = assigned.filter((i) => !dealerIdSet.has(i.assignedTo));
    console.log(`Found ${misassigned.length} enquiry(ies) assigned to a non-Client-Dealer.`);

    for (const inq of misassigned) {
      const dealerId = await pickLeastLoadedDealer();
      if (!dealerId) {
        console.log("  No active Client Dealer to reassign to — skipping.");
        break;
      }
      await inq.update({ assignedTo: dealerId, assignedAt: new Date() });
      console.log(`  Reassigned enquiry ${inq.id} -> Client Dealer ${dealerId}`);
    }

    // ---- 2. Default stage for stageless enquiries ----
    const defaultStage = await getDefaultStage();
    if (!defaultStage) {
      console.log("No active stages configured — skipping stage backfill.");
    } else {
      const stageless = await PropertyInquiry.findAll({
        where: { stageId: null },
        attributes: ["id", "inquirerId"],
      });
      console.log(`Found ${stageless.length} enquiry(ies) with no stage; setting to "${defaultStage.name}".`);
      for (const inq of stageless) {
        await inq.update({ stageId: defaultStage.id });
        await InquiryStatusHistory.create({
          inquiryId: inq.id,
          stageId: defaultStage.id,
          stageName: defaultStage.name,
          note: "Backfilled to default stage",
          changedBy: inq.inquirerId || null,
        });
      }
    }

    console.log("Backfill complete.");
    process.exit(0);
  } catch (e) {
    console.error("Backfill failed:", e.message);
    process.exit(1);
  }
})();
