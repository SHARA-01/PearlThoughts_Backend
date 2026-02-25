import { Injectable, Query } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";


@Injectable()

export class DoctorService {
    constructor(private  prisma: PrismaService) { }

    async findAllDoctors(@Query('specialization') specialization?: string) {
        console.log("Finding doctors with specialization:", specialization);
        return this.prisma.doctor.findMany({
            where: {
                specialization: specialization ? { contains: specialization, mode: 'insensitive' } : undefined,
                isAvailable: true,
            },
            include: {
                user: {
                    select: { name: true, email: true }
                }
            }
        });
    }

  async getDoctorAvailability(doctorId: number, dateString: string) {
    const searchDate = new Date(dateString);
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const dayOfWeek = days[searchDate.getDay()];

    //Check for a Specific Date 
    let slots = await this.prisma.slot.findMany({
      where: { 
        doctorId: doctorId, 
        date: dateString 
      },
      include: { 
        times: { 
          orderBy: { time: 'asc' } 
        } 
      }
    });

    //use the Weekly Recurring Schedule
    if (!slots || slots.length === 0) {
      slots = await this.prisma.slot.findMany({
        where: { 
          doctorId: doctorId, 
          dayOfWeek: dayOfWeek, 
          date: null 
        },
        include: { 
          times: { 
            orderBy: { time: 'asc' } 
          } 
        }
      });
    }

    //If still no slots, the doctor is off that day.
    if (!slots || slots.length === 0) {
      return { 
        message: `Doctor is not available on ${dateString} (${dayOfWeek}).`, 
        availableSlots: [] 
      };
    }

    const formattedSlots = slots.map(slot => {
      const openTimes = slot.times.filter(t => t.currentBookings < t.maxCapacity);

      return {
        slotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        type: slot.schedulingType, 
        
        slotDuration: slot.schedulingType === 'WAVE' ? slot.slotDuration : null,

        queueStats: slot.schedulingType === 'STREAM' ? {
          totalCapacity: slot.maxBookings,
          currentQueueLength: slot.times[0]?.currentBookings || 0,
          spotsLeft: (slot.maxBookings - (slot.times[0]?.currentBookings || 0))
        } : null,

        availableTimes: openTimes.map(t => ({
          timeId: t.id, 
          time: t.time, 
          isBooked: t.isBooked
        }))
      };
    });

    return {
      doctorId,
      date: dateString,
      dayOfWeek,
      slots: formattedSlots
    };
  }
}
