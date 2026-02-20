import { Injectable, Query } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";


@Injectable()

export class DoctorService {
    constructor(private readonly prisma: PrismaService) { }

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

        const slots = await this.prisma.slot.findMany({
            where: {
                doctorId: doctorId,
                dayOfWeek: dayOfWeek
            },
            include: {
                times: {
                    where: { isBooked: false },
                    orderBy: { time: 'asc' }
                }
            }
        });

        if (!slots || slots.length === 0) {
            return { message: `Doctor is not working on ${dayOfWeek}s`, availableSlots: [] };
        }

        const availableTimes = slots.flatMap(slot => slot.times);

        return {
            doctor: doctorId,
            date: dateString,
            day: dayOfWeek,
            totalFree: availableTimes.length,
            availableSlots: availableTimes
        };
    }
}