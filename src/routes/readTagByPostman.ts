import { Router, Request, Response } from "express";

const router = Router();

// router.get("/read", async (req: Request, res: Response) => {
//     const { channel, device, tagGroup, tagName } = req.query as {
//         channel: string;
//         device: string;
//         tagGroup: string;
//         tagName: string;
//     };
//     if (!channel || !device || !tagGroup || !tagName) {
//         res.status(400).send({
//             message: "inValid Query",
//         });
//     }
//     const eqpNode: EqpNode = {
//         channel,
//         device,
//         tagGroup,
//         tagName,
//     };

//     try {
//         // const result = await readTagValue(eqpNode);

//         res.status(200).send({
//             message: "Read successful",
//             status: result.statuscode!.toString(),
//             value: result.value,
//         });
//     } catch (err: any) {
//         res.status(500).send({
//             message: `Error reading to node`,
//             node: eqpNode,
//             error: err.message,
//         });
//     }
// });

// router.get("/heartbeat", async (req: Request, res: Response) => {
//     const { nodeId } = req.query as {
//         nodeId: string;
//     };
//     if (!nodeId) {
//         res.status(400).send({
//             message: "inValid Query",
//         });
//     }

//     try {
//         const result = await heartbeat(nodeId);

//         res.status(200).send({
//             message: "Read successful",
//             status: result.statuscode!.toString(),
//             value: result.value,
//         });
//     } catch (err: any) {
//         res.status(500).send({
//             message: `Error reading to node`,
//             node: nodeId,
//             error: err.message,
//         });
//     }
// });

export { router };
