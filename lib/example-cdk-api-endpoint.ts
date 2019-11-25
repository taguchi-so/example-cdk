import * as cdk from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import * as apigateway from "@aws-cdk/aws-apigateway";
import * as route53 from "@aws-cdk/aws-route53";
import { Certificate } from "@aws-cdk/aws-certificatemanager";

interface apiEndpointConfig {
  customDomainName: string;
  certificateArn: string;
  hostedZoneId: string;
}

interface StageContext {
  description: string;
  api: apiEndpointConfig;
}

export class ExampleCdkAPIEndpointStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // TODO: environment from ?
    const env: string = this.node.tryGetContext("env") || "dev";
    const revision: string = this.node.tryGetContext("revision") || "";
    const context: StageContext = this.node.tryGetContext(env) || {};
    if (
      context.api.customDomainName == "" ||
      context.api.certificateArn == "" ||
      context.api.hostedZoneId == ""
    ) {
      throw new Error(
        `[${this.stackName}] error: invalid context ${JSON.stringify({
          env,
          revision,
          context
        })}`
      );
    }

    // API Gatewayの作成
    const sampleAPI: apigateway.RestApi = new apigateway.RestApi(
      this,
      `${this.stackName}-RestApi`,
      {
        restApiName: `${this.stackName}-RestApi`,
        endpointTypes: [apigateway.EndpointType.REGIONAL],
        description: context.description
      }
    );

    // カスタムドメインの作成
    const domainName = new apigateway.DomainName(
      this,
      `${this.stackName}-DomainName`,
      {
        certificate: Certificate.fromCertificateArn(
          this,
          `${this.stackName}-Certificate`,
          context.api.certificateArn
        ),
        domainName: context.api.customDomainName,
        endpointType: apigateway.EndpointType.REGIONAL
      }
    );
    // ベースパスマッピングの設定
    domainName.addBasePathMapping(sampleAPI, {
      basePath: "v1"
    });

    // Aレコード登録
    new route53.ARecord(this, `${this.stackName}-ARecord`, {
      zone: route53.HostedZone.fromHostedZoneId(
        this,
        `${this.stackName}-HostedZone`,
        context.api.hostedZoneId
      ),
      recordName: `${context.api.customDomainName}.`,
      target: route53.AddressRecordTarget.fromAlias({
        bind: (): route53.AliasRecordTargetConfig => ({
          dnsName: domainName.domainNameAliasDomainName,
          hostedZoneId: domainName.domainNameAliasHostedZoneId
        })
      })
    });

    // setup lamda function
    let lambdaName;
    lambdaName = "samplesLambda";
    const indexSampleLambda = new lambda.Function(
      this,
      `${this.stackName}-${lambdaName}`,
      {
        functionName: `${this.stackName}-${lambdaName}`,
        runtime: lambda.Runtime.NODEJS_10_X,
        handler: "index.handler",
        code: lambda.Code.asset("src/lambda/sample"),
        timeout: cdk.Duration.seconds(60),
        environment: {
          ENV: env,
          REVISION: revision
        }
      }
    );
    const samplesResource = sampleAPI.root.addResource("samples");
    const indexSamplesIntegration = new apigateway.LambdaIntegration(
      indexSampleLambda
    );
    samplesResource.addMethod("GET", indexSamplesIntegration);
  }
}
