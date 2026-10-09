import {MigrationInterface, QueryRunner} from "typeorm";

export class ContentEnquiries1791515198055 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "enquiry" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "code" character varying(32) NOT NULL, "type" character varying(40) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'new', "contactName" character varying(100) NOT NULL, "contactCompany" character varying(120), "contactEmail" character varying(254) NOT NULL, "contactPhone" character varying(20) NOT NULL, "items" text NOT NULL, "totalQuantity" integer NOT NULL DEFAULT '0', "currencyCode" character varying NOT NULL, "details" text, "internalNotes" text, "id" SERIAL NOT NULL, "channelId" integer NOT NULL, "itemsTotalWithTax" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_768f5a12cc02c52aca60752a310" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3fe5b04fbb289333befe79a989" ON "enquiry" ("code") `, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_414868c4f330c1a1c26716949f" ON "enquiry" ("status") `, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_4d0d9476c75bec3228e8943516" ON "enquiry" ("channelId") `, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsHeroeyebrow" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsHerotitle" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsHerotext" text`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsFeaturedcollectionslug" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsFeaturedtitle" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsFeaturedintro" text`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsWhatsappnumber" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsContactemail" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsBusinesshours" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsShowpreviewnotice" boolean NOT NULL DEFAULT true`, undefined);
        await queryRunner.query(`ALTER TABLE "enquiry" ADD CONSTRAINT "FK_4d0d9476c75bec3228e8943516c" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "enquiry" DROP CONSTRAINT "FK_4d0d9476c75bec3228e8943516c"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsShowpreviewnotice"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsBusinesshours"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsContactemail"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsWhatsappnumber"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsFeaturedintro"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsFeaturedtitle"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsFeaturedcollectionslug"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsHerotext"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsHerotitle"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsHeroeyebrow"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_4d0d9476c75bec3228e8943516"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_414868c4f330c1a1c26716949f"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_3fe5b04fbb289333befe79a989"`, undefined);
        await queryRunner.query(`DROP TABLE "enquiry"`, undefined);
   }

}
