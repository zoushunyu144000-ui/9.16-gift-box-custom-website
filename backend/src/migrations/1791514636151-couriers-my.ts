import {MigrationInterface, QueryRunner} from "typeorm";

export class CouriersMy1791514636151 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "easy_parcel_connection" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" character varying NOT NULL, "sealedTokens" text NOT NULL, "expiresAt" TIMESTAMP(3), "refreshTokenExpiresAt" TIMESTAMP(3), "lastRefreshedAt" TIMESTAMP(3), "connectedByUserId" character varying, "id" SERIAL NOT NULL, CONSTRAINT "PK_400256f5178199036e24479379c" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3228968640217302752743e928" ON "easy_parcel_connection" ("channelId") `, undefined);
        await queryRunner.query(`CREATE TABLE "courier_geocode" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "addressHash" character varying(64) NOT NULL, "lat" character varying(32) NOT NULL, "lng" character varying(32) NOT NULL, "locationType" character varying(32), "id" SERIAL NOT NULL, CONSTRAINT "PK_e381649dbe84a91ec80ca0277c7" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3489c235d037ed200f01538a05" ON "courier_geocode" ("addressHash") `, undefined);
        await queryRunner.query(`CREATE TABLE "courier_shipment_event" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "fulfillmentId" character varying NOT NULL, "provider" character varying(20) NOT NULL, "providerOrderId" character varying, "eventKey" character varying(200) NOT NULL, "source" character varying(20) NOT NULL, "status" character varying(30), "providerStatus" character varying(255), "occurredAt" TIMESTAMP(3), "id" SERIAL NOT NULL, CONSTRAINT "PK_720dc6c68d33d281dd9c83c4e12" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_51ccf56745be3201fa4b1098cd" ON "courier_shipment_event" ("fulfillmentId") `, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2ef093fa8430e19e866e075363" ON "courier_shipment_event" ("eventKey") `, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsProvider" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsProviderorderid" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsTrackingurl" character varying(1024)`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsLabelurl" character varying(1024)`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsShipmentstatus" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsLasteventat" TIMESTAMP(6)`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsLabelsize" character varying(4)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsLabelsize"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsLasteventat"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsShipmentstatus"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsLabelurl"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsTrackingurl"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsProviderorderid"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsProvider"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_2ef093fa8430e19e866e075363"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_51ccf56745be3201fa4b1098cd"`, undefined);
        await queryRunner.query(`DROP TABLE "courier_shipment_event"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_3489c235d037ed200f01538a05"`, undefined);
        await queryRunner.query(`DROP TABLE "courier_geocode"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_3228968640217302752743e928"`, undefined);
        await queryRunner.query(`DROP TABLE "easy_parcel_connection"`, undefined);
   }

}
