import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, Subject, of } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';

import { UserService } from '../../services/user.service';
import { LanguageService } from '../../services/language.service';
import { SpecialityService } from '../../services/speciality.service';
import { ToastService } from '../../services/toast/toast.service';
import { User, UserSex, Language, Speciality, UpdateUserProfileDto } from '../../models/user.model';
import { ButtonComponent } from '../../components/ui/button/button.component';
import { ButtonVariant, ButtonSize, ButtonType } from '../../constants/button.enums';

const PHONE_NUMBER_REGEX = /^[+]?[1-9][\d\s\-\(\)]{7,15}$/;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 50;

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SG', name: 'Singapore' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'ZA', name: 'South Africa' }
] as const;

const GENDER_OPTIONS = [
  { value: UserSex.MALE, label: 'Male' },
  { value: UserSex.FEMALE, label: 'Female' },
  { value: UserSex.OTHER, label: 'Other' }
] as const;

interface CountryOption {
  readonly code: string;
  readonly name: string;
}

interface GenderOption {
  readonly value: UserSex;
  readonly label: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatIconModule,
    ButtonComponent
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit, OnDestroy {
  private readonly userService = inject(UserService);
  private readonly languageService = inject(LanguageService);
  private readonly specialityService = inject(SpecialityService);
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);
  private readonly destroy$ = new Subject<void>();

  readonly profileForm: FormGroup;
  readonly currentUser = signal<User | null>(null);
  readonly languages = signal<Language[]>([]);
  readonly specialities = signal<Speciality[]>([]);
  readonly countries: readonly CountryOption[] = COUNTRIES;
  readonly genderOptions: readonly GenderOption[] = GENDER_OPTIONS;

  readonly isLoading = signal<boolean>(true);
  readonly isSaving = signal<boolean>(false);

  readonly isFormValid = computed(() => this.profileForm?.valid ?? false);
  readonly hasUnsavedChanges = computed(() => this.profileForm?.dirty && !this.isSaving());

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;
  readonly ButtonType = ButtonType;

  constructor() {
    this.profileForm = this.createProfileForm();
  }

  ngOnInit(): void {
    this.loadProfileData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createProfileForm(): FormGroup {
    return this.fb.group({
      firstName: ['', [
        Validators.required, 
        Validators.minLength(MIN_NAME_LENGTH), 
        Validators.maxLength(MAX_NAME_LENGTH)
      ]],
      lastName: ['', [
        Validators.required, 
        Validators.minLength(MIN_NAME_LENGTH), 
        Validators.maxLength(MAX_NAME_LENGTH)
      ]],
      phoneNumber: ['', [Validators.pattern(PHONE_NUMBER_REGEX)]],
      country: [''],
      sex: [''],
      languageIds: [[]],
      specialityIds: [[]]
    });
  }

  loadProfileData(): void {
    this.isLoading.set(true);

    forkJoin({
      user: this.userService.getCurrentUser().pipe(
        catchError(error => {
          console.error('Error loading user profile:', error);
          this.toastService.showError('Failed to load user profile');
          return of(null);
        })
      ),
      languages: this.languageService.getAllLanguages().pipe(
        catchError(error => {
          console.error('Error loading languages:', error);
          this.toastService.showError('Failed to load languages');
          return of([]);
        })
      ),
      specialities: this.specialityService.getAllSpecialities().pipe(
        catchError(error => {
          console.error('Error loading specialities:', error);
          this.toastService.showError('Failed to load specialities');
          return of([]);
        })
      )
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: ({ user, languages, specialities }) => {
        this.currentUser.set(user);
        this.languages.set(languages);
        this.specialities.set(specialities);

        if (user) {
          this.populateForm(user);
        }
      },
      error: (error) => {
        console.error('Error loading profile data:', error);
        this.toastService.showError('Failed to load profile data');
      }
    });
  }

  private populateForm(user: User): void {
    this.profileForm.patchValue({
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber || '',
      country: user.country || '',
      sex: user.sex || '',
      languageIds: user.languageIds || [],
      specialityIds: user.specialityIds || []
    });
  }

  onSave(): void {
    if (!this.isFormValid() || !this.currentUser()) {
      this.markFormGroupTouched();
      return;
    }

    this.isSaving.set(true);
    this.profileForm.disable(); 
    
    const formValue = this.profileForm.value;
    const user = this.currentUser()!;

    const updateData: UpdateUserProfileDto = {
      firstName: formValue.firstName?.trim(),
      lastName: formValue.lastName?.trim(),
      phoneNumber: formValue.phoneNumber?.trim() || null,
      country: formValue.country || null,
      sex: formValue.sex || null,
      languageIds: formValue.languageIds || [],
      specialityIds: formValue.specialityIds || []
    };

    this.userService.updateUserProfile(user.id, updateData).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isSaving.set(false);
        this.profileForm.enable(); 
      })
    ).subscribe({
      next: (updatedUser) => {
        this.currentUser.set(updatedUser);
        this.toastService.showSuccess('Profile updated successfully');
        this.profileForm.markAsPristine();
      },
      error: (error) => {
        console.error('Error updating profile:', error);
        this.toastService.showError('Failed to update profile. Please try again.');
      }
    });
  }

  onReset(): void {
    const user = this.currentUser();
    if (user) {
      this.populateForm(user);
      this.profileForm.markAsPristine();
    }
  }

  private markFormGroupTouched(): void {
    Object.keys(this.profileForm.controls).forEach(key => {
      const control = this.profileForm.get(key);
      if (control) {
        control.markAsTouched();
      }
    });
  }

  trackByLanguageId = (index: number, language: Language): number => language.id;
  trackBySpecialityId = (index: number, speciality: Speciality): number => speciality.id;
  trackByCountryCode = (index: number, country: CountryOption): string => country.code;
  trackByGenderValue = (index: number, gender: GenderOption): UserSex => gender.value;
  
  get firstName(): FormControl { return this.profileForm.get('firstName') as FormControl; }
  get lastName(): FormControl { return this.profileForm.get('lastName') as FormControl; }
  get phoneNumber(): FormControl { return this.profileForm.get('phoneNumber') as FormControl; }
  get country(): FormControl { return this.profileForm.get('country') as FormControl; }
  get sex(): FormControl { return this.profileForm.get('sex') as FormControl; }
  get languageIds(): FormControl { return this.profileForm.get('languageIds') as FormControl; }
  get specialityIds(): FormControl { return this.profileForm.get('specialityIds') as FormControl; }
}
