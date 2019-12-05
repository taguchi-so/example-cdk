import * as cdk from "@aws-cdk/core";
import * as docdb from "@aws-cdk/aws-docdb";

interface DocDBConfig {
  dbSubnetGroupName: string;
  vpcSecurityGroupIds: string[];
  dbInstanceClass: string;
  availabilityZone: string;
}
interface StageContext {
  docdb: DocDBConfig;
}

export class ExampleCdkDocDBStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // TODO: environment from ?
    const env: string = this.node.tryGetContext("env") || "dev";
    const revision: string = this.node.tryGetContext("revision") || "";
    const context: StageContext = this.node.tryGetContext(env) || {};
    if (!context.docdb) {
      throw new Error(
        `[${this.stackName}] error: invalid context ${JSON.stringify({
          env,
          revision,
          context
        })}`
      );
    }

    const userName = "cdktest";
    const password = "cdktest!temporary";
    const cluster = new docdb.CfnDBCluster(this, "DocDbCluster", {
      dbClusterIdentifier: `ExampleCdkDocDBStack-${env}`,
      masterUsername: userName,
      masterUserPassword: password,
      vpcSecurityGroupIds: context.docdb.vpcSecurityGroupIds,
      dbSubnetGroupName: context.docdb.dbSubnetGroupName
    });

    let instanceCount: number = 1;
    new docdb.CfnDBInstance(this, `DocDbInstance${instanceCount++}`, {
      dbClusterIdentifier: cluster.ref,
      dbInstanceClass: context.docdb.dbInstanceClass,
      availabilityZone: context.docdb.availabilityZone
    });
  }
}
