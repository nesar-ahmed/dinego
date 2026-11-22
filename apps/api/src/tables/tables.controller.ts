import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PublicTablesResponseDto } from "./dto/swagger.dto.js";
import { TablesService } from "./tables.service.js";

/** Public table list for the dine-in option at checkout. No authentication required. */
@ApiTags("Tables")
@Controller("tables")
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @ApiOperation({
    summary: "Tables customers can choose for dine-in",
    description:
      "Active tables in natural label order (T2 before T10). `orderable` is true when the table can be selected at checkout right now; the internal floor status is not exposed.",
  })
  @ApiOkResponse({ type: PublicTablesResponseDto })
  @Get()
  list() {
    return this.tablesService.listPublic();
  }
}
