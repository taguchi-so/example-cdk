import * as cdk from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import * as s3 from "@aws-cdk/aws-s3";
import * as iam from "@aws-cdk/aws-iam";
import * as events from "@aws-cdk/aws-events";
import * as targets from "@aws-cdk/aws-events-targets";
import * as ec2 from "@aws-cdk/aws-ec2";

interface subnetCongfig {
  subnetId: string;
  availabilityZone: string;
  routeTableId: string;
}

interface StageContext {
  bucketName: string;
  vpcName: string;
  privateSubnets: subnetCongfig[];
  securityGroupID: string;
}
export class ExampleCdkLambdaCronStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // TODO: environment from ?
    const env: string = this.node.tryGetContext("env") || "dev";
    const revision: string = this.node.tryGetContext("revision") || "";
    const context: StageContext = this.node.tryGetContext(env) || {};

    if (
      context.bucketName == "" ||
      context.vpcName == "" ||
      context.privateSubnets.length == 0
    ) {
      throw new Error(
        `error: invalid context:${JSON.stringify({
          env,
          revision,
          context
        })}`
      );
    }

    // create s3 bucket
    const bucket = new s3.Bucket(this, "Bucket", {
      versioned: false,
      bucketName: context.bucketName,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    const getPolicyStatement = new iam.PolicyStatement();
    getPolicyStatement.addActions("s3:GetObject");
    getPolicyStatement.addResources(`arn:aws:s3:::${context.bucketName}/*`);
    getPolicyStatement.addServicePrincipal(`logs.${this.region}.amazonaws.com`);
    bucket.addToResourcePolicy(getPolicyStatement);

    const putPolicyStatement = new iam.PolicyStatement();
    putPolicyStatement.addActions("s3:PutObject");
    putPolicyStatement.addResources(`arn:aws:s3:::${context.bucketName}/*`);
    putPolicyStatement.addServicePrincipal(`logs.${this.region}.amazonaws.com`);
    putPolicyStatement.addCondition("StringEquals", {
      "s3:x-amz-acl": "bucket-owner-full-control"
    });
    bucket.addToResourcePolicy(putPolicyStatement);

    // describe vpc and private subnet and security group
    const vpc = ec2.Vpc.fromLookup(this, "VPC", {
      vpcId: context.vpcName
    });

    const selectSubnets: ec2.SelectedSubnets = vpc.selectSubnets({
      subnets: context.privateSubnets.map(privateSubnet => {
        return ec2.Subnet.fromSubnetAttributes(this, privateSubnet.subnetId, {
          subnetId: privateSubnet.subnetId,
          availabilityZone: privateSubnet.availabilityZone,
          routeTableId: privateSubnet.routeTableId
        });
      })
    });

    const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "SecurityGroup",
      context.securityGroupID
    );

    // create lamda to selected vpc and private subnet
    const cronLambda = new lambda.Function(this, "cronLambda", {
      code: lambda.Code.asset("src/lambda/sample"),
      handler: "cron.handler",
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.NODEJS_10_X,
      environment: {
        ENV: env,
        REVISION: revision
      },
      vpc: vpc,
      vpcSubnets: selectSubnets,
      securityGroup: securityGroup
    });

    const rule = new events.Rule(this, "Rule", {
      schedule: events.Schedule.expression("cron(0 18 ? * MON-FRI *)")
    });
    rule.addTarget(new targets.LambdaFunction(cronLambda));
  }
}
