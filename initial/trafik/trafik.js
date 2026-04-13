import grpc from "k6/net/grpc";
import { check } from "k6";

// Shipyard sets K6_NAMESPACE on the k6-initial-runner job; local runs can use default or override.
const namespace = __ENV.K6_NAMESPACE || "default";
const grpcPort = __ENV.K6_TRAFIK_GRPC_PORT || "8080";
// Matches basic-service K8s Service name for catalog "module-trafik" (ServiceWorkloadName).
const serviceAddress =
  __ENV.K6_TRAFIK_GRPC_ADDR ||
  `module-trafik.${namespace}.svc.cluster.local:${grpcPort}`;

const client = new grpc.Client();

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  client.connect(serviceAddress, {
    plaintext: true,
    reflect: true,
  });

  try {
    const response = client.invoke(
      "moduletrafik.TrafikModuleService/ReloadData",
      {},
      { timeout: "5s" }
    );

    check(response, {
      "ReloadData status is OK": (res) => res && res.status === grpc.StatusOK,
      "ReloadData response body present": (res) =>
        res !== null && res !== undefined,
    });

    if (response && response.status === grpc.StatusOK) {
      console.log(
        `ReloadData OK namespace=${namespace} addr=${serviceAddress}`
      );
    } else {
      console.error(`ReloadData failed: ${JSON.stringify(response)}`);
    }
  } finally {
    client.close();
  }
}
