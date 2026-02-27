import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { SlotsService } from './slots.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('slots')
@UseGuards(JwtAuthGuard) 
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) { }

  @Post()
  create(@Request() req, @Body() createSlotDto: CreateSlotDto) {
    return this.slotsService.create(req.user.userId, createSlotDto);
  }

  @Get()
  findMySlots(@Request() req) {
    return this.slotsService.findMySlots(req.user.userId);
  }

  @Patch(':id')
  update(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateSlotDto
  ) {
    return this.slotsService.updateSlot(req.user.userId, id, updateDto);
  }

  // 🗑️ SAFE DELETE
  @Delete(':id')
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.slotsService.remove(req.user.userId, id);
  }
}