import {MigrationInterface, QueryRunner} from "typeorm";

export class PersonalisationGiftMessageAgeCheck1791501592314 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsPersonalisationenabled" boolean DEFAULT true`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsPersonalisationlabel" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsPersonalisationhelper" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsPersonalisationmaxlength" integer DEFAULT '20'`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsAgeconfirmed" boolean DEFAULT false`, undefined);
        await queryRunner.query(`ALTER TABLE "order_line" ADD "customFieldsNames" text`, undefined);
        await queryRunner.query(`ALTER TABLE "order_line" ADD "customFieldsNamesfor" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "order_line" ADD "customFieldsGiftmessage" text`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "order_line" DROP COLUMN "customFieldsGiftmessage"`, undefined);
        await queryRunner.query(`ALTER TABLE "order_line" DROP COLUMN "customFieldsNamesfor"`, undefined);
        await queryRunner.query(`ALTER TABLE "order_line" DROP COLUMN "customFieldsNames"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsAgeconfirmed"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsPersonalisationmaxlength"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsPersonalisationhelper"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsPersonalisationlabel"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsPersonalisationenabled"`, undefined);
   }

}
